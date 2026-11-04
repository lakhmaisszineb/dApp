
import {
  Contract,
  ZeroAddress,
  formatEther,
  formatUnits,
  isAddress,
} from "ethers";

import { getReadContracts } from "./contracts.js";
import tokenArtifact from "../contracts/CFDToken.json";

// ============================================================
// TIWIZI - SERVICE DU PORTEFEUILLE PERSONNEL
//
// Informations :
// - Solde ETH
// - Contributions historiques
// - CFD detenus par campagne
// - Campagnes creees ou beneficiaires
// - Statut et echeance compensee
// - Eligibilite potentielle au remboursement
// ============================================================

const STATUS_LABELS = [
  "Active",
  "Réussie",
  "Échouée",
  "Annulée",
];

// Formater les valeurs sans perdre leur precision.
function formatAmount(value, decimals = 18) {
  return formatUnits(value, decimals);
}

// Limiter le nombre de lectures simultanees.
async function mapInBatches(items, batchSize, callback) {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(callback)
    );

    results.push(...batchResults);
  }

  return results;
}

// Lecture d'une campagne et des droits du compte.
async function readWalletCampaign({
  crowdfunding,
  provider,
  campaignId,
  account,
  overrides,
  effectiveTime,
}) {
  const campaign = await crowdfunding.campaigns(
    campaignId,
    overrides
  );

  if (campaign.creator === ZeroAddress) {
    return null;
  }

  const token = new Contract(
    campaign.token,
    tokenArtifact.abi,
    provider
  );

  const [
    contribution,
    cfdBalance,
    effectiveDeadline,
  ] = await Promise.all([
    crowdfunding.contributions(
      campaignId,
      account,
      overrides
    ),
    token.balanceOf(account, overrides),
    crowdfunding.effectiveDeadline(
      campaignId,
      overrides
    ),
  ]);

  const isCreator =
    campaign.creator.toLowerCase() ===
    account.toLowerCase();

  const isBeneficiary =
    campaign.beneficiary.toLowerCase() ===
    account.toLowerCase();

  const hasContributed = contribution > 0n;
  const hasCFD = cfdBalance > 0n;

  // Ne garder que les campagnes pertinentes
  // pour le portefeuille connecte.
  if (
    !isCreator &&
    !isBeneficiary &&
    !hasContributed &&
    !hasCFD
  ) {
    return null;
  }

  const ended =
    effectiveTime >= campaign.deadline;

  const statusNumber = Number(campaign.status);

  let status = STATUS_LABELS[statusNumber] ?? "Inconnu";

  // Une campagne active dans le stockage peut avoir
  // atteint sa date limite et attendre sa finalisation.
  if (statusNumber === 0 && ended) {
    status =
      campaign.totalRaised >= campaign.goal
        ? "Objectif atteint - à finaliser"
        : "Objectif non atteint - à finaliser";
  }

  // Le remboursement est possible uniquement si
  // la campagne est officiellement Failed ou Cancelled
  // et que le compte possede des CFD remboursables.
  const refundable =
    (statusNumber === 2 || statusNumber === 3) &&
    cfdBalance >= 1000n;

  return {
    id: campaignId.toString(),

    creator: campaign.creator,
    beneficiary: campaign.beneficiary,
    tokenAddress: campaign.token,

    isCreator,
    isBeneficiary,
    hasContributed,
    hasCFD,

    contributionWei: contribution,
    cfdBalanceWei: cfdBalance,

    contribution: formatEther(contribution),
    cfdBalance: formatAmount(cfdBalance),

    goal: formatEther(campaign.goal),
    totalRaised: formatEther(campaign.totalRaised),

    status,
    statusNumber,
    frozen: campaign.isFrozen,

    deadline: new Date(
      Number(effectiveDeadline) * 1000
    ).toLocaleString("fr-FR"),

    refundable,

    // Un retrait est destine au beneficiaire
    // lorsque la campagne est reussie.
    canRequestWithdrawal:
      isBeneficiary &&
      statusNumber === 1 &&
      !campaign.fundsWithdrawn &&
      !campaign.isFrozen,
  };
}

// ============================================================
// LECTURE COMPLETE DU PORTEFEUILLE
// ============================================================

export async function readWalletPortfolio(account) {
  if (!account || !isAddress(account)) {
    throw new Error(
      "Connecte un portefeuille Ethereum valide."
    );
  }

  const { crowdfunding } = await getReadContracts();

  const provider = crowdfunding.runner.provider;

  const block = await provider.getBlock("latest");

  if (!block) {
    throw new Error(
      "Impossible de lire le dernier bloc Ethereum."
    );
  }

  // Toutes les informations contractuelles sont lues
  // sur le meme bloc.
  const overrides = {
    blockTag: block.number,
  };

  const [
    ethBalance,
    campaignCount,
    effectiveTime,
  ] = await Promise.all([
    provider.getBalance(account, block.number),

    crowdfunding.campaignCount(overrides),

    crowdfunding.effectiveTime(overrides),
  ]);

  const ids = [];

  for (let id = 1n; id <= campaignCount; id++) {
    ids.push(id);
  }

  const results = await mapInBatches(
    ids,
    5,
    (campaignId) =>
      readWalletCampaign({
        crowdfunding,
        provider,
        campaignId,
        account,
        overrides,
        effectiveTime,
      })
  );

  const campaigns = [];
  let failedReads = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value) {
        campaigns.push(result.value);
      }
    } else {
      failedReads += 1;
    }
  }

  campaigns.sort(
    (a, b) => Number(b.id) - Number(a.id)
  );

  // Historique des ETH envoyes par le compte.
  let contributedWei = 0n;

  // Solde indicatif des CFD de toutes les campagnes.
  // Ce ne sont PAS des jetons interchangeables.
  let totalCFDWei = 0n;

  let campaignsWithCFD = 0;
  let campaignsCreated = 0;
  let campaignsBeneficiary = 0;

  for (const campaign of campaigns) {
    contributedWei += campaign.contributionWei;
    totalCFDWei += campaign.cfdBalanceWei;

    if (campaign.hasCFD) campaignsWithCFD += 1;
    if (campaign.isCreator) campaignsCreated += 1;
    if (campaign.isBeneficiary) {
      campaignsBeneficiary += 1;
    }
  }

  return {
    account,
    chainBlock: block.number,

    ethBalance: formatEther(ethBalance),

    campaignCount: campaignCount.toString(),

    contributedETH: formatEther(contributedWei),
    totalCFD: formatAmount(totalCFDWei),

    relatedCampaigns: campaigns.length,
    campaignsWithCFD,
    campaignsCreated,
    campaignsBeneficiary,

    failedReads,
    complete: failedReads === 0,

    campaigns,
  };
}
