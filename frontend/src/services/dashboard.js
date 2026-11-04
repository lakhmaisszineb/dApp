
import {
  Contract,
  ZeroAddress,
  formatEther,
  formatUnits,
  isAddress,
} from "ethers";

import { readPresentation } from "./projectDetails.js";

import { getReadContracts } from "./contracts.js";
import {
  readRecentProposals,
  readProposal,
} from "./governance.js";

import tokenArtifact from "../contracts/CFDToken.json";

// ============================================================
// TIWIZI — SERVICE DU TABLEAU DE BORD PERSONNEL
//
// Données réelles de la blockchain :
// - Campagnes créées / bénéficiaires
// - Contributions historiques
// - Soldes CFD actuels
// - Propositions et votes
//
// Aucune transaction d'écriture.
// Aucun accès à une clé privée.
// ============================================================

const STATUS_NAMES = [
  "En cours",
  "Réussie",
  "Échouée",
  "Annulée",
];

const MAX_CAMPAIGNS = 100;
const BATCH_SIZE = 5;

function sameAddress(first, second) {
  return Boolean(first && second) &&
    String(first).toLowerCase() ===
      String(second).toLowerCase();
}

function toSafeNumber(value) {
  const result = Number(value);

  if (!Number.isSafeInteger(result)) {
    throw new Error("Identifiant blockchain trop grand.");
  }

  return result;
}

async function readOneCampaign({
  crowdfunding,
  provider,
  account,
  id,
  blockTag,
  effectiveTime,
}) {
  const overrides = { blockTag };

  const [
    campaign,
    contributionWei,
  ] = await Promise.all([
    crowdfunding.campaigns(id, overrides),
    crowdfunding.contributions(
      id,
      account,
      overrides
    ),
  ]);

  if (campaign.creator === ZeroAddress) {
    return null;
  }

  const tokenAddress = campaign.token;

  const token = new Contract(
    tokenAddress,
    tokenArtifact.abi,
    provider
  );

  const [
    cfdBalanceWei,
    deadline,
    presentation,
    ] = await Promise.all([
    token.balanceOf(account, overrides),

    crowdfunding.effectiveDeadline(
        id,
        overrides
    ),

    // Récupérer la présentation depuis IPFS.
    // Si la passerelle est indisponible, la fonction
    // retourne null et la campagne reste affichable.
    readPresentation(campaign.ipfsHash),
    ]);

  const creator = sameAddress(
    campaign.creator,
    account
  );

  const beneficiary = sameAddress(
    campaign.beneficiary,
    account
  );

  const hasContributed = contributionWei > 0n;
  const hasCFD = cfdBalanceWei > 0n;

  const ended =
    effectiveTime >= campaign.deadline;

  const statusCode = Number(campaign.status);

  let status =
    STATUS_NAMES[statusCode] ?? "Inconnu";

  if (statusCode === 0 && ended) {
    status =
      campaign.totalRaised >= campaign.goal
        ? "À finaliser — objectif atteint"
        : "À finaliser — objectif non atteint";
  }

  return {
    id: String(id),

    creator: campaign.creator,
    beneficiary: campaign.beneficiary,
    tokenAddress,
    ipfsHash: campaign.ipfsHash,

    // Présentation IPFS du projet
    title:
        presentation?.title ||
        `Campagne #${id}`,

    summary:
        presentation?.summary || "",

    description:
        presentation?.description || "",

    category:
        presentation?.category || "",

    imageURL:
        presentation?.imageURL || null,

    fundsUsage:
        presentation?.fundsUsage || [],

    presentationAvailable:
        presentation !== null,

    goalETH: formatEther(campaign.goal),
    totalRaisedETH: formatEther(
      campaign.totalRaised
    ),
    availableFundsETH: formatEther(
      campaign.availableFunds
    ),

    contributionETH: formatEther(
      contributionWei
    ),
    cfdBalance: formatUnits(
      cfdBalanceWei,
      18
    ),

    deadlineISO: new Date(
      Number(deadline) * 1000
    ).toISOString(),

    status,
    statusCode,
    frozen: Boolean(campaign.isFrozen),
    fundsWithdrawn: Boolean(
      campaign.fundsWithdrawn
    ),

    isCreator: creator,
    isBeneficiary: beneficiary,
    hasContributed,
    hasCFD,
  };
}

// ------------------------------------------------------------
// Lecture des campagnes par petits lots
// ------------------------------------------------------------

export async function readPersonalCampaigns(account) {
  if (!isAddress(account)) {
    throw new Error("Adresse Ethereum invalide.");
  }

  const { crowdfunding } =
    await getReadContracts();

  const provider = crowdfunding.runner;

  const block = await provider.getBlock("latest");

  if (!block) {
    throw new Error(
      "Impossible de récupérer le dernier bloc."
    );
  }

  const overrides = {
    blockTag: block.number,
  };

  const [
    countRaw,
    effectiveTime,
  ] = await Promise.all([
    crowdfunding.campaignCount(overrides),
    crowdfunding.effectiveTime(overrides),
  ]);

  const count = toSafeNumber(countRaw);

  // Les campagnes les plus récentes sont examinées.
  // Lorsque la plateforme dépasse 100 campagnes,
  // on signale que le résultat est partiel.
  const firstId = Math.max(
    1,
    count - MAX_CAMPAIGNS + 1
  );

  const ids = [];

  for (let id = count; id >= firstId; id--) {
    ids.push(id);
  }

  const campaigns = [];
  const failedIds = [];

  for (
    let offset = 0;
    offset < ids.length;
    offset += BATCH_SIZE
  ) {
    const batch = ids.slice(
      offset,
      offset + BATCH_SIZE
    );

    const results = await Promise.allSettled(
      batch.map((id) =>
        readOneCampaign({
          crowdfunding,
          provider,
          account,
          id,
          blockTag: block.number,
          effectiveTime,
        })
      )
    );

    results.forEach((result, index) => {
      if (
        result.status === "fulfilled" &&
        result.value
      ) {
        campaigns.push(result.value);
      } else if (result.status === "rejected") {
        failedIds.push(batch[index]);
      }
    });
  }

  const myProjects = campaigns.filter(
    (campaign) =>
      campaign.isCreator ||
      campaign.isBeneficiary
  );

  const myContributions = campaigns.filter(
    (campaign) =>
      campaign.hasContributed
  );

  const myTokens = campaigns.filter(
    (campaign) =>
      campaign.hasCFD
  );

  const sum = (items, field) =>
    items.reduce(
      (total, item) =>
        total + Number(item[field] || 0),
      0
    );

  return {
    totalCampaignsOnChain: count,
    scannedCampaignCount: ids.length,
    incomplete:
      count > MAX_CAMPAIGNS ||
      failedIds.length > 0,
    failedIds,

    myProjects,
    myContributions,
    myTokens,

    totals: {
      projects: myProjects.length,
      contributions: myContributions.length,
      tokenCampaigns: myTokens.length,
      historicalETH: sum(
        myContributions,
        "contributionETH"
      ).toString(),
    },
  };
}

// ------------------------------------------------------------
// Gouvernance : propositions récentes et votes du compte
// ------------------------------------------------------------

export async function readPersonalGovernance(account) {
  if (!isAddress(account)) {
    throw new Error("Adresse Ethereum invalide.");
  }

  const recent = await readRecentProposals();

  const results = await Promise.allSettled(
    recent.map((proposal) =>
      readProposal(proposal.id, account)
    )
  );

  const proposals = [];
  let failedCount = 0;

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      const proposal = result.value;

      proposals.push({
        id: String(proposal.id),
        campaignId: String(proposal.campaignId),
        type: proposal.type,
        state: proposal.state,
        hasVoted: Boolean(proposal.hasVoted),
        canVote: Boolean(proposal.canVote),
        weight: proposal.weight,
        forVotes: proposal.forVotes,
        againstVotes: proposal.againstVotes,
        deadline: proposal.deadline,
        url:
          `/gouvernance?proposal=${proposal.id}`,
      });
    } else {
      failedCount++;
    }
  });

  return {
    proposals,
    voted: proposals.filter(
      (proposal) => proposal.hasVoted
    ),
    availableVotes: proposals.filter(
      (proposal) => proposal.canVote
    ),
    incomplete: failedCount > 0,
    limitedToRecent: true,
  };
}

// ------------------------------------------------------------
// Tableau de bord : agréger sans bloquer une section
// si une autre échoue
// ------------------------------------------------------------

export async function readPersonalDashboard(account) {
  const [campaignResult, governanceResult] =
    await Promise.allSettled([
      readPersonalCampaigns(account),
      readPersonalGovernance(account),
    ]);

  const errors = [];

  const campaigns =
    campaignResult.status === "fulfilled"
      ? campaignResult.value
      : null;

  const governance =
    governanceResult.status === "fulfilled"
      ? governanceResult.value
      : null;

  if (!campaigns) {
    errors.push(
      "Les campagnes et les CFD n'ont pas pu être chargés."
    );
  }

  if (!governance) {
    errors.push(
      "Les propositions de gouvernance n'ont pas pu être chargées."
    );
  }

  return {
    campaigns,
    governance,
    errors,
  };
}
