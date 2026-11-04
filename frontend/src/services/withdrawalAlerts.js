
import {
  Contract,
  ZeroAddress,
  formatEther,
  formatUnits,
  isAddress,
} from "ethers";

import { getReadContracts } from "./contracts.js";
import { readMultiSigDashboard } from "./multisig.js";

import tokenArtifact from "../contracts/CFDToken.json";

// ============================================================
// TIWIZI — ALERTES AUTOMATIQUES BLOCKCHAIN
//
// 1. Demandes de retrait : WithdrawalRequested
// 2. Réception de CFD : Transfer
//
// Lecture uniquement, aucune transaction envoyée.
//
// Pour la démonstration Hardhat locale.
// ============================================================

const MAX_CAMPAIGNS = 100;
const BATCH_SIZE = 5;

function sameAddress(a, b) {
  return String(a || "").toLowerCase() ===
    String(b || "").toLowerCase();
}

function eventId(prefix, event, extra = "") {
  return [
    prefix,
    event.transactionHash,
    event.index,
    extra,
  ].join(":");
}

function formatAmount(value, decimals = 18) {
  return formatUnits(value, decimals);
}

// ------------------------------------------------------------
// DEMANDES DE RETRAIT
// ------------------------------------------------------------

async function readRequestedWithdrawals({
  crowdfunding,
  provider,
  account,
  isSignataire,
  threshold,
  blockNumber,
}) {
  const events = await crowdfunding.queryFilter(
    crowdfunding.filters.WithdrawalRequested(),
    0,
    blockNumber
  );

  const alerts = [];

  for (const event of events) {
    const id = event.args.campaignId;

    const [campaign, request] = await Promise.all([
      crowdfunding.campaigns(id, {
        blockTag: blockNumber,
      }),

      crowdfunding.withdrawals(id, {
        blockTag: blockNumber,
      }),
    ]);

    // Ignorer les demandes ayant déjà abouti.
    if (!request.requested || campaign.fundsWithdrawn) {
      continue;
    }

    const amountETH = formatEther(
      request.grossAmount
    );

    // --------------------------------------------------------
    // ALERTE MULTISIGNATURE
    // --------------------------------------------------------

    if (
      isSignataire &&
      request.grossAmount > threshold &&
      !request.multisigApproved
    ) {
      alerts.push({
        id: eventId("withdrawal-multisig", event),
        type: "multisig",

        title: "Retrait à approuver — Multisignature",

        message:
          `La campagne #${id} demande un retrait ` +
          `de ${amountETH} ETH. ` +
          "Une approbation de 2 signataires sur 3 " +
          "est nécessaire.",

        campaignId: id.toString(),
        url: "/multisig",

        blockNumber: event.blockNumber,
        logIndex: event.index,
      });
    }

    // --------------------------------------------------------
    // ALERTE AUX DÉTENTEURS DE CFD
    // --------------------------------------------------------

    if (!request.governanceApproved) {
      const token = new Contract(
        campaign.token,
        tokenArtifact.abi,
        provider
      );

      const balance = await token.balanceOf(
        account,
        { blockTag: blockNumber }
      );

      if (balance > 0n) {
        alerts.push({
          id: eventId("withdrawal-governance", event),
          type: "governance",

          title: "Nouvelle demande de retrait",

          message:
            `La campagne #${id} demande un retrait ` +
            `de ${amountETH} ETH. ` +
            "Une proposition de gouvernance doit " +
            "être créée et soumise au vote.",

          campaignId: id.toString(),
          url: "/gouvernance",

          blockNumber: event.blockNumber,
          logIndex: event.index,
        });
      }
    }
  }

  return alerts;
}

// ------------------------------------------------------------
// TRANSFERTS DE CFD REÇUS
// ------------------------------------------------------------

async function readOneCampaignTransfers({
  crowdfunding,
  provider,
  account,
  campaignId,
  blockNumber,
}) {
  const campaign = await crowdfunding.campaigns(
    campaignId,
    { blockTag: blockNumber }
  );

  if (!campaign.token) {
    return [];
  }

  const token = new Contract(
    campaign.token,
    tokenArtifact.abi,
    provider
  );

  // Le second paramètre indexé est le destinataire.
  const filter = token.filters.Transfer(
    null,
    account
  );

  const events = await token.queryFilter(
    filter,
    0,
    blockNumber
  );

  const alerts = [];

  for (const event of events) {
    const from = event.args.from;
    const to = event.args.to;
    const amount = event.args.value;

    // Ne pas notifier la création initiale (mint)
    // ni un éventuel transfert vers soi-même.
    if (
      sameAddress(from, ZeroAddress) ||
      sameAddress(from, to)
    ) {
      continue;
    }

    if (amount <= 0n) {
      continue;
    }

    const amountCFD = formatAmount(
      amount,
      18
    );

    alerts.push({
      id: eventId(
        "cfd-received",
        event,
        campaignId.toString()
      ),

      type: "transfer",

      title: "Vous avez reçu des CFD",

      message:
        `Vous avez reçu ${amountCFD} CFD ` +
        `de la campagne #${campaignId}, ` +
        `envoyés par ${from.slice(0, 8)}...` +
        `${from.slice(-6)}.`,

      campaignId: campaignId.toString(),
      from,
      amountCFD,

      url: `/campagnes/${campaignId}`,

      blockNumber: event.blockNumber,
      logIndex: event.index,
    });
  }

  return alerts;
}

async function readIncomingTransfers({
  crowdfunding,
  provider,
  account,
  blockNumber,
}) {
  const count = Number(
    await crowdfunding.campaignCount({
      blockTag: blockNumber,
    })
  );

  if (!Number.isSafeInteger(count)) {
    throw new Error(
      "Nombre de campagnes trop important."
    );
  }

  // Limite pour la première version du frontend.
  const firstId = Math.max(
    1,
    count - MAX_CAMPAIGNS + 1
  );

  const campaignIds = [];

  for (
    let id = count;
    id >= firstId;
    id--
  ) {
    campaignIds.push(id);
  }

  const alerts = [];
  const failedCampaigns = [];

  // Éviter de lancer toutes les requêtes à la fois.
  for (
    let offset = 0;
    offset < campaignIds.length;
    offset += BATCH_SIZE
  ) {
    const batch = campaignIds.slice(
      offset,
      offset + BATCH_SIZE
    );

    const results = await Promise.allSettled(
      batch.map((campaignId) =>
        readOneCampaignTransfers({
          crowdfunding,
          provider,
          account,
          campaignId,
          blockNumber,
        })
      )
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        alerts.push(...result.value);
      } else {
        failedCampaigns.push(batch[index]);
      }
    });
  }

  return {
    alerts,
    incomplete:
      count > MAX_CAMPAIGNS ||
      failedCampaigns.length > 0,
  };
}

// ------------------------------------------------------------
// POINT D'ENTRÉE
// ------------------------------------------------------------

export async function readWithdrawalAlerts(account) {
  if (!isAddress(account)) {
    return {
      alerts: [],
      incomplete: false,
      errors: [],
    };
  }

  const {
    crowdfunding,
  } = await getReadContracts();

  const provider = crowdfunding.runner;

  const block = await provider.getBlock("latest");

  if (!block) {
    throw new Error(
      "Impossible de lire le dernier bloc."
    );
  }

  const [
    threshold,
    signerResult,
  ] = await Promise.all([
    crowdfunding.MULTISIG_THRESHOLD({
      blockTag: block.number,
    }),

    readMultiSigDashboard(account, 1),
  ]);

  const isSignataire =
    Boolean(signerResult.isSignataire);

  // Les deux catégories restent indépendantes :
  // une erreur de lecture ne masque pas l'autre.
  const results = await Promise.allSettled([
    readRequestedWithdrawals({
      crowdfunding,
      provider,
      account,
      isSignataire,
      threshold,
      blockNumber: block.number,
    }),

    readIncomingTransfers({
      crowdfunding,
      provider,
      account,
      blockNumber: block.number,
    }),
  ]);

  const alerts = [];
  const errors = [];
  let incomplete = false;

  if (results[0].status === "fulfilled") {
    alerts.push(...results[0].value);
  } else {
    incomplete = true;
    errors.push(
      "Impossible de lire les demandes de retrait."
    );
  }

  if (results[1].status === "fulfilled") {
    alerts.push(...results[1].value.alerts);

    incomplete ||= results[1].value.incomplete;
  } else {
    incomplete = true;
    errors.push(
      "Impossible de lire les transferts CFD."
    );
  }

  alerts.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return b.blockNumber - a.blockNumber;
    }

    return b.logIndex - a.logIndex;
  });

  return {
    alerts,
    incomplete,
    errors,
  };
}
