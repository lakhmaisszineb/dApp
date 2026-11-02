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

// Lecture via le nœud local : aucun compte connecté n'est nécessaire.
// Les opérations d'écriture utiliseront MetaMask dans l'étape suivante.
const provider = new JsonRpcProvider(
  import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545"
);

export async function getReadContracts() {
  const network = await provider.getNetwork();

  if (network.chainId !== BigInt(deployment.chainId)) {
    throw new Error(
      "Le réseau RPC ne correspond pas au réseau du déploiement."
    );
  }

  const addresses = [
    deployment.crowdfunding,
    deployment.governance,
    deployment.multiSig,
  ];

  // Une adresse peut être correcte dans le fichier alors que
  // le nœud a été redémarré et ne contient plus les contrats.
  const codes = await Promise.all(
    addresses.map((address) => provider.getCode(address))
  );

  if (codes.some((code) => code === "0x")) {
    throw new Error(
      "Un contrat est absent du réseau local. " +
      "Vérifie le nœud Hardhat et le dernier déploiement."
    );
  }

  return {
    crowdfunding: new Contract(
      deployment.crowdfunding,
      crowdfundingArtifact.abi,
      provider
    ),

    governance: new Contract(
      deployment.governance,
      governanceArtifact.abi,
      provider
    ),

    multiSig: new Contract(
      deployment.multiSig,
      multiSigArtifact.abi,
      provider
    ),
  };
}

export async function readPlatformStatus() {
  const { crowdfunding, governance, multiSig } =
    await getReadContracts();

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
    crowdfunding.paused(),
    crowdfunding.governance(),
    crowdfunding.multiSig(),
    governance.crowdfunding(),
  ]);

  const sameAddress = (first, second) =>
    first.toLowerCase() === second.toLowerCase();

  const correctlyLinked =
    sameAddress(governanceAddress, deployment.governance) &&
    sameAddress(multiSigAddress, deployment.multiSig) &&
    sameAddress(crowdfundingAddress, deployment.crowdfunding);

  if (!correctlyLinked) {
    throw new Error(
      "Les liens entre les contrats ne correspondent pas au déploiement."
    );
  }

  return {
    campaignCount: campaignCount.toString(),
    proposalCount: proposalCount.toString(),
    transactionCount: transactionCount.toString(),
    paused,
  };
}
function parseCampaignId(value) {
  const text = String(value).trim();

  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error(
      "L'identifiant de campagne doit être un entier supérieur à zéro."
    );
  }

  return BigInt(text);
}

function getMetaMaskProvider() {
  const ethereum = window.ethereum;

  if (Array.isArray(ethereum?.providers)) {
    return ethereum.providers.find((item) => item.isMetaMask);
  }

  return ethereum?.isMetaMask ? ethereum : undefined;
}

/**
 * Préparer les contrats liés au compte MetaMask.
 * Cette fonction sera réutilisée pour les votes.
 */
export async function getWriteContracts() {
  const wallet = getMetaMaskProvider();

  if (!wallet) {
    throw new Error("MetaMask n'est pas disponible.");
  }

  const chainId = await wallet.request({
    method: "eth_chainId",
  });

  if (BigInt(chainId) !== BigInt(deployment.chainId)) {
    throw new Error("Sélectionne le réseau Hardhat dans MetaMask.");
  }

  const accounts = await wallet.request({
    method: "eth_accounts",
  });

  if (!accounts.length) {
    throw new Error("Connecte d'abord ton compte avec le bouton MetaMask.");
  }

  const walletProvider = new BrowserProvider(wallet);
  const signer = await walletProvider.getSigner(accounts[0]);

  // Vérifier les contrats sur le réseau réellement utilisé par MetaMask.
  const addresses = [
    deployment.crowdfunding,
    deployment.governance,
    deployment.multiSig,
  ];

  const codes = await Promise.all(
    addresses.map((address) => walletProvider.getCode(address))
  );

  if (codes.some((code) => code === "0x")) {
    throw new Error(
      "Contrats introuvables sur le réseau utilisé par MetaMask."
    );
  }

  return {
    signer,
    provider: walletProvider,

    crowdfunding: new Contract(
      deployment.crowdfunding,
      crowdfundingArtifact.abi,
      signer
    ),

    governance: new Contract(
      deployment.governance,
      governanceArtifact.abi,
      signer
    ),

    multiSig: new Contract(
      deployment.multiSig,
      multiSigArtifact.abi,
      signer
    ),
  };
}

/**
 * Lire une campagne pour préparer une contribution.
 */
export async function readCampaignForContribution(value) {
  const campaignId = parseCampaignId(value);
  const { crowdfunding } = await getReadContracts();

  // Utiliser le même bloc pour les informations financières.
  const block = await provider.getBlock("latest");

  if (!block) {
    throw new Error("Impossible de lire le dernier bloc.");
  }

  const overrides = { blockTag: block.number };

  const [campaign, paused, rate] = await Promise.all([
    crowdfunding.campaigns(campaignId, overrides),
    crowdfunding.paused(overrides),
    crowdfunding.CFD_RATE(overrides),
  ]);

  if (campaign.creator === ZeroAddress) {
    throw new Error("Cette campagne n'existe pas.");
  }

  const ended = BigInt(block.timestamp) >= campaign.deadline;

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
    totalRaised: formatEther(campaign.totalRaised),
    deadline: new Date(
      Number(campaign.deadline) * 1000
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

/**
 * Envoyer une contribution.
 * La quantité de CFD est calculée par Crowdfunding.
 */
export async function contributeToCampaign(
  campaignIdValue,
  amountValue,
  onSubmitted
) {
  const campaignId = parseCampaignId(campaignIdValue);
  const text = String(amountValue).trim();

  if (!/^\d+(\.\d{1,18})?$/.test(text)) {
    throw new Error(
      "Indique un montant en ETH avec un point et au maximum 18 décimales."
    );
  }

  const amount = parseEther(text);

  if (amount <= 0n) {
    throw new Error("Le montant doit être supérieur à zéro.");
  }

  const { crowdfunding, signer, provider: walletProvider } =
    await getWriteContracts();

  const block = await walletProvider.getBlock("latest");

  if (!block) {
    throw new Error("Impossible de lire le réseau MetaMask.");
  }

  const [campaign, paused] = await Promise.all([
    crowdfunding.campaigns(campaignId),
    crowdfunding.paused(),
  ]);

  if (campaign.creator === ZeroAddress) {
    throw new Error("Cette campagne n'existe pas.");
  }

  if (
    campaign.status !== 0n ||
    BigInt(block.timestamp) >= campaign.deadline
  ) {
    throw new Error("La campagne n'accepte plus de contributions.");
  }

  if (paused || campaign.isFrozen) {
    throw new Error("Les contributions sont suspendues.");
  }

  const tx = await crowdfunding.contribute(campaignId, {
    value: amount,
  });

  onSubmitted?.(tx.hash);

  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("La contribution n'a pas été confirmée avec succès.");
  }

  // Lire le solde obtenu dans le token de cette campagne.
  const token = new Contract(
    campaign.token,
    tokenArtifact.abi,
    walletProvider
  );

  let cfdBalance = null;

  try {
    const balance = await token.balanceOf(
      await signer.getAddress(),
      { blockTag: receipt.blockNumber }
    );

    cfdBalance = formatUnits(balance, 18);
  } catch {
    // Une erreur de lecture du solde ne doit pas faire croire
    // que la contribution confirmée a échoué.
  }

  return {
    hash: receipt.hash,
    cfdBalance,
  };
}