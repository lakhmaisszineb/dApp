
import {
  getReadContracts,
  getWriteContracts,
} from "./contracts.js";

// Convertit un timestamp Solidity en date affichable.
function formatDate(value) {
  const seconds = Number(value);

  if (!seconds) return "Non disponible";

  return new Date(seconds * 1000).toLocaleString("fr-FR");
}

// Lecture des informations du circuit breaker.
export async function readAdminDashboard(account = "") {
  const { crowdfunding } = await getReadContracts();

  const [
    adminRole,
    defaultAdminRole,
    campaignCount,
    storedPaused,
    emergencyActive,
    pauseStartedAt,
    pauseExpiresAt,
    totalPausedSeconds,
    lastPauseEndedAt,
    maxPauseDuration,
    pauseCooldown,
    hasPausedBefore,
  ] = await Promise.all([
    crowdfunding.ADMIN_ROLE(),
    crowdfunding.DEFAULT_ADMIN_ROLE(),
    crowdfunding.campaignCount(),
    crowdfunding.paused(),
    crowdfunding.emergencyPauseActive(),
    crowdfunding.pauseStartedAt(),
    crowdfunding.pauseExpiresAt(),
    crowdfunding.totalPausedSeconds(),
    crowdfunding.lastPauseEndedAt(),
    crowdfunding.MAX_PAUSE_DURATION(),
    crowdfunding.PAUSE_COOLDOWN(),
    crowdfunding.hasPausedBefore(),
  ]);

  const hasAccount = Boolean(account);

  const [isAdmin, isDefaultAdmin] = hasAccount
    ? await Promise.all([
        crowdfunding.hasRole(adminRole, account),
        crowdfunding.hasRole(defaultAdminRole, account),
      ])
    : [false, false];

  // Horloge du réseau Ethereum, et non uniquement du navigateur.
  const block = await crowdfunding.runner.provider.getBlock(
    "latest"
  );

  const blockchainTime = BigInt(block.timestamp);

  const remainingSeconds = emergencyActive
    ? pauseExpiresAt > blockchainTime
      ? pauseExpiresAt - blockchainTime
      : 0n
    : 0n;

  const nextPauseAllowedAt = hasPausedBefore
    ? lastPauseEndedAt + pauseCooldown
    : 0n;

  // Une pause expirée peut encore être enregistrée
  // dans le stockage jusqu'à expirePause ou une opération.
  const pauseNeedsClosing =
    storedPaused && !emergencyActive;

  const canStartPause =
    !storedPaused &&
    (!hasPausedBefore ||
      blockchainTime >= nextPauseAllowedAt);

  return {
    account,
    isAdmin,
    isDefaultAdmin,
    campaignCount: campaignCount.toString(),

    paused: storedPaused,
    emergencyActive,
    pauseNeedsClosing,
    canStartPause,

    pauseStartedAt: Number(pauseStartedAt),
    pauseExpiresAt: Number(pauseExpiresAt),
    remainingSeconds: Number(remainingSeconds),

    totalPausedSeconds: Number(totalPausedSeconds),
    lastPauseEndedAt: Number(lastPauseEndedAt),
    maxPauseDuration: Number(maxPauseDuration),
    pauseCooldown: Number(pauseCooldown),

    nextPauseAllowedAt: Number(nextPauseAllowedAt),
    hasPausedBefore,

    pauseStartedAtFormatted: formatDate(pauseStartedAt),
    pauseExpiresAtFormatted: formatDate(pauseExpiresAt),
    lastPauseEndedAtFormatted: formatDate(lastPauseEndedAt),
    nextPauseAllowedAtFormatted: formatDate(
      nextPauseAllowedAt
    ),
  };
}

// Historique des pauses sur les derniers blocs.
export async function readPauseHistory() {
  const { crowdfunding } = await getReadContracts();
  const provider = crowdfunding.runner.provider;

  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - 5000);

  const [starts, ends] = await Promise.all([
    crowdfunding.queryFilter(
      crowdfunding.filters.EmergencyPauseStarted(),
      fromBlock,
      latestBlock
    ),
    crowdfunding.queryFilter(
      crowdfunding.filters.EmergencyPauseEnded(),
      fromBlock,
      latestBlock
    ),
  ]);

  const events = [
    ...starts.map((event) => ({
      type: "Début de pause",
      timestamp: Number(event.args.startedAt),
      operator: event.args.administrator,
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
      duration: null,
    })),

    ...ends.map((event) => ({
      type: "Fin de pause",
      timestamp: Number(event.args.endedAt),
      operator: event.args.operator,
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
      duration: Number(event.args.duration),
    })),
  ];

  return events
    .sort((a, b) =>
      b.blockNumber - a.blockNumber
    )
    .slice(0, 20);
}

// Vérifier le rôle Admin avant toute action sensible.
async function getAuthorizedAdminContract() {
  const { crowdfunding, signer } =
    await getWriteContracts();

  const account = await signer.getAddress();
  const role = await crowdfunding.ADMIN_ROLE();

  if (!(await crowdfunding.hasRole(role, account))) {
    throw new Error(
      "Ce portefeuille ne possède pas ADMIN_ROLE."
    );
  }

  return crowdfunding;
}

async function waitForSuccess(transaction, message) {
  const receipt = await transaction.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error(message);
  }

  return receipt.hash;
}

// Admin : déclencher une pause d'urgence.
export async function pausePlatform() {
  const crowdfunding =
    await getAuthorizedAdminContract();

  if (await crowdfunding.paused()) {
    throw new Error(
      "Une pause existe déjà. Clôture-la si elle a expiré."
    );
  }

  const transaction = await crowdfunding.pause();

  return waitForSuccess(
    transaction,
    "La transaction de pause a échoué."
  );
}

// Admin : terminer une pause avant son expiration.
export async function resumePlatform() {
  const crowdfunding =
    await getAuthorizedAdminContract();

  if (!(await crowdfunding.paused())) {
    throw new Error("La plateforme est déjà active.");
  }

  const transaction = await crowdfunding.unpause();

  return waitForSuccess(
    transaction,
    "La transaction de reprise a échoué."
  );
}

// Tout utilisateur : clôturer une pause expirée.
export async function closeExpiredPause() {
  const { crowdfunding } = await getWriteContracts();

  if (!(await crowdfunding.paused())) {
    throw new Error(
      "Aucune pause à clôturer."
    );
  }

  if (await crowdfunding.emergencyPauseActive()) {
    throw new Error(
      "Les 24 heures ne sont pas encore écoulées."
    );
  }

  const transaction =
    await crowdfunding.expirePause();

  return waitForSuccess(
    transaction,
    "La clôture de la pause a échoué."
  );
}
