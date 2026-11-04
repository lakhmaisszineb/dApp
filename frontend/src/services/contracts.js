
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  formatEther,
  formatUnits,
  parseEther,
} from "ethers";

import tokenArtifact from "../contracts/CFDToken.json";
import deployment from "../contracts/deployment.json";
import crowdfundingArtifact from "../contracts/Crowdfunding.json";
import governanceArtifact from "../contracts/Governance.json";
import multiSigArtifact from "../contracts/MultiSig.json";

// ============================================================
// TIWIZI - SERVICE DE CONNEXION AUX SMART CONTRACTS
// Compatible avec le circuit breaker et les échéances compensées
// ============================================================

// Fournisseur RPC pour les lectures sans portefeuille.
const provider = new JsonRpcProvider(
  import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545"
);

// ------------------------------------------------------------
// OUTILS INTERNES
// ------------------------------------------------------------

// Vérifier qu'un identifiant de campagne est valide.
function parseCampaignId(value) {
  const text = String(value).trim();

  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error(
      "L'identifiant de campagne doit être un entier supérieur à zéro."
    );
  }

  return BigInt(text);
}

// Récupérer le fournisseur MetaMask.
function getMetaMaskProvider() {
  const ethereum = window.ethereum;

  if (Array.isArray(ethereum?.providers)) {
    return ethereum.providers.find(
      (item) => item.isMetaMask
    );
  }

  return ethereum?.isMetaMask
    ? ethereum
    : undefined;
}

// Vérifier que les contrats existent sur le réseau.
async function verifyContracts(providerToCheck) {
  const addresses = [
    deployment.crowdfunding,
    deployment.governance,
    deployment.multiSig,
  ];

  const codes = await Promise.all(
    addresses.map((address) =>
      providerToCheck.getCode(address)
    )
  );

  if (codes.some((code) => code === "0x")) {
    throw new Error(
      "Un ou plusieurs smart contracts sont absents du réseau. " +
      "Vérifie le nœud Hardhat et le dernier déploiement."
    );
  }
}

// Construire les instances des contrats.
function buildContracts(runner) {
  return {
    crowdfunding: new Contract(
      deployment.crowdfunding,
      crowdfundingArtifact.abi,
      runner
    ),

    governance: new Contract(
      deployment.governance,
      governanceArtifact.abi,
      runner
    ),

    multiSig: new Contract(
      deployment.multiSig,
      multiSigArtifact.abi,
      runner
    ),
  };
}

// ============================================================
// 1. LECTURE DES SMART CONTRACTS
// ============================================================

export async function getReadContracts() {
  const network = await provider.getNetwork();

  if (
    network.chainId !== BigInt(deployment.chainId)
  ) {
    throw new Error(
      "Le réseau RPC ne correspond pas au réseau du déploiement."
    );
  }

  await verifyContracts(provider);

  return buildContracts(provider);
}

// ============================================================
// 2. ÉTAT GLOBAL DE LA PLATEFORME
// ============================================================

export async function readPlatformStatus() {
  const {
    crowdfunding,
    governance,
    multiSig,
  } = await getReadContracts();

  const [
    campaignCount,
    proposalCount,
    transactionCount,
    paused,
    governanceAddress,
    multiSigAddress,
    crowdfundingAddress,
  ] = await Promise.all([
    crowdfunding.campaignCount(),
    governance.proposalCount(),
    multiSig.transactionCount(),

    // Nouveau circuit breaker :
    // true uniquement si la pause est réellement active.
    crowdfunding.emergencyPauseActive(),

    crowdfunding.governance(),
    crowdfunding.multiSig(),
    governance.crowdfunding(),
  ]);

  const sameAddress = (first, second) =>
    first.toLowerCase() === second.toLowerCase();

  const correctlyLinked =
    sameAddress(
      governanceAddress,
      deployment.governance
    ) &&
    sameAddress(
      multiSigAddress,
      deployment.multiSig
    ) &&
    sameAddress(
      crowdfundingAddress,
      deployment.crowdfunding
    );

  if (!correctlyLinked) {
    throw new Error(
      "Les liens entre les smart contracts ne correspondent pas au déploiement."
    );
  }

  return {
    campaignCount: campaignCount.toString(),
    proposalCount: proposalCount.toString(),
    transactionCount: transactionCount.toString(),
    paused,
  };
}

// ============================================================
// 3. CONNEXION METAMASK POUR LES TRANSACTIONS
// ============================================================

export async function getWriteContracts() {
  const wallet = getMetaMaskProvider();

  if (!wallet) {
    throw new Error(
      "MetaMask n'est pas disponible."
    );
  }

  const chainId = await wallet.request({
    method: "eth_chainId",
  });

  if (
    BigInt(chainId) !== BigInt(deployment.chainId)
  ) {
    throw new Error(
      "Sélectionne le bon réseau Hardhat dans MetaMask."
    );
  }

  const accounts = await wallet.request({
    method: "eth_accounts",
  });

  if (!accounts.length) {
    throw new Error(
      "Connecte d'abord ton compte MetaMask."
    );
  }

  const walletProvider = new BrowserProvider(wallet);

  const signer =
    await walletProvider.getSigner(accounts[0]);

  await verifyContracts(walletProvider);

  return {
    signer,
    provider: walletProvider,
    ...buildContracts(signer),
  };
}

// ============================================================
// 4. LECTURE D'UNE CAMPAGNE AVANT CONTRIBUTION
// ============================================================

export async function readCampaignForContribution(value) {
  const campaignId = parseCampaignId(value);

  const { crowdfunding } =
    await getReadContracts();

  // Utiliser le même bloc pour éviter des lectures
  // incohérentes si l'état change entre deux appels.
  const block = await provider.getBlock("latest");

  if (!block) {
    throw new Error(
      "Impossible de lire le dernier bloc."
    );
  }

  const overrides = {
    blockTag: block.number,
  };

  const [
    campaign,
    paused,
    rate,
    effectiveTime,
    effectiveDeadline,
  ] = await Promise.all([
    crowdfunding.campaigns(
      campaignId,
      overrides
    ),

    // La pause est-elle réellement active ?
    crowdfunding.emergencyPauseActive(overrides),

    crowdfunding.CFD_RATE(overrides),

    // Horloge logique du circuit breaker.
    crowdfunding.effectiveTime(overrides),

    // Date réelle avec compensation.
    crowdfunding.effectiveDeadline(
      campaignId,
      overrides
    ),
  ]);

  if (campaign.creator === ZeroAddress) {
    throw new Error(
      "Cette campagne n'existe pas."
    );
  }

  // Important :
  // campaign.deadline est exprimée dans
  // l'horloge effective du contrat.
  const ended =
    effectiveTime >= campaign.deadline;

  let displayedStatus;

  if (campaign.status === 0n && ended) {
    displayedStatus =
      campaign.totalRaised >= campaign.goal
        ? "Objectif atteint — finalisation à effectuer"
        : "Objectif non atteint — finalisation à effectuer";
  } else {
    displayedStatus = [
      "Active",
      "Réussie",
      "Échouée",
      "Annulée",
    ][Number(campaign.status)];
  }

  return {
    id: campaignId.toString(),

    goal: formatEther(campaign.goal),

    totalRaised: formatEther(
      campaign.totalRaised
    ),

    // Date affichée : échéance compensée.
    deadline: new Date(
      Number(effectiveDeadline) * 1000
    ).toLocaleString("fr-FR"),

    status: displayedStatus,

    frozen: campaign.isFrozen,

    paused,

    rate: rate.toString(),

    canContribute:
      campaign.status === 0n &&
      !ended &&
      !campaign.isFrozen &&
      !paused,
  };
}

// ============================================================
// 5. ENVOI D'UNE CONTRIBUTION EN ETH
// ============================================================

export async function contributeToCampaign(
  campaignIdValue,
  amountValue,
  onSubmitted
) {
  const campaignId =
    parseCampaignId(campaignIdValue);

  const text = String(amountValue).trim();

  // Accepter un montant positif en ETH
  // avec au maximum 18 décimales.
  if (!/^\d+(\.\d{1,18})?$/.test(text)) {
    throw new Error(
      "Indique un montant en ETH avec un point et au maximum 18 décimales."
    );
  }

  const amount = parseEther(text);

  if (amount <= 0n) {
    throw new Error(
      "Le montant doit être supérieur à zéro."
    );
  }

  const {
    crowdfunding,
    signer,
    provider: walletProvider,
  } = await getWriteContracts();

  // Lecture cohérente de l'état avant contribution.
  const block = await walletProvider.getBlock(
    "latest"
  );

  if (!block) {
    throw new Error(
      "Impossible de lire le réseau MetaMask."
    );
  }

  const overrides = {
    blockTag: block.number,
  };

  const [
    campaign,
    paused,
    effectiveTime,
  ] = await Promise.all([
    crowdfunding.campaigns(
      campaignId,
      overrides
    ),

    crowdfunding.emergencyPauseActive(
      overrides
    ),

    crowdfunding.effectiveTime(
      overrides
    ),
  ]);

  if (campaign.creator === ZeroAddress) {
    throw new Error(
      "Cette campagne n'existe pas."
    );
  }

  // Utiliser l'horloge effective :
  // les pauses ne pénalisent pas les campagnes.
  const ended =
    effectiveTime >= campaign.deadline;

  if (
    campaign.status !== 0n ||
    ended
  ) {
    throw new Error(
      "La campagne n'accepte plus de contributions."
    );
  }

  // Refuser une contribution si :
  // - pause d'urgence active ;
  // - campagne gelée par la gouvernance.
  if (paused) {
    throw new Error(
      "TIWIZI est temporairement suspendue pour des raisons de sécurité."
    );
  }

  if (campaign.isFrozen) {
    throw new Error(
      "Cette campagne est gelée par la gouvernance."
    );
  }

  // ----------------------------------------------------------
  // ENVOI DE LA TRANSACTION
  // ----------------------------------------------------------

  const tx = await crowdfunding.contribute(
    campaignId,
    {
      value: amount,
    }
  );

  // Notifier l'interface dès la soumission.
  onSubmitted?.(tx.hash);

  // Attendre la confirmation blockchain.
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error(
      "La contribution n'a pas été confirmée avec succès."
    );
  }

  // ----------------------------------------------------------
  // RÉCUPÉRER LES CFD OBTENUS
  // ----------------------------------------------------------

  // Chaque campagne possède son propre CFDToken.
  const token = new Contract(
    campaign.token,
    tokenArtifact.abi,
    walletProvider
  );

  let cfdBalance = null;

  try {
    const balance = await token.balanceOf(
      await signer.getAddress(),
      {
        blockTag: receipt.blockNumber,
      }
    );

    cfdBalance = formatUnits(
      balance,
      18
    );
  } catch {
    // Si la lecture CFD échoue, la contribution
    // confirmée reste une transaction réussie.
  }

  return {
    hash: receipt.hash,
    cfdBalance,
  };
}
