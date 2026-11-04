
import {
  Contract,
  formatEther,
  formatUnits,
  isAddress,
} from "ethers";

import {
  getReadContracts,
  getWriteContracts,
} from "./contracts.js";

import tokenArtifact from "../contracts/CFDToken.json";

// ============================================================
// TIWIZI — ACTIONS FINANCIÈRES DES CAMPAGNES
// Lecture : état, remboursement et demande de retrait
// Écriture : transactions MetaMask confirmées
// ============================================================

function validId(value) {
  const text = String(value).trim();

  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error("Identifiant de campagne invalide.");
  }

  return BigInt(text);
}

function sameAddress(a, b) {
  return (
    String(a).toLowerCase() ===
    String(b).toLowerCase()
  );
}

// ------------------------------------------------------------
// Lire les droits financiers d'un portefeuille
// ------------------------------------------------------------

export async function readCampaignFinancialActions(
  campaignIdValue,
  account
) {
  if (!isAddress(account)) {
    throw new Error("Adresse Ethereum invalide.");
  }

  const id = validId(campaignIdValue);

  const { crowdfunding } =
    await getReadContracts();

  const provider = crowdfunding.runner;

  const block = await provider.getBlock("latest");

  if (!block) {
    throw new Error("Dernier bloc introuvable.");
  }

  const overrides = {
    blockTag: block.number,
  };

  const [
    campaign,
    withdrawal,
    effectiveTime,
    paused,
    rate,
  ] = await Promise.all([
    crowdfunding.campaigns(id, overrides),
    crowdfunding.withdrawals(id, overrides),
    crowdfunding.effectiveTime(overrides),
    crowdfunding.emergencyPauseActive(overrides),
    crowdfunding.CFD_RATE(overrides),
  ]);

  const token = new Contract(
    campaign.token,
    tokenArtifact.abi,
    provider
  );

  const cfdBalance = await token.balanceOf(
    account,
    overrides
  );

  const isBeneficiary = sameAddress(
    campaign.beneficiary,
    account
  );

  const ended =
    effectiveTime >= campaign.deadline;

  const reachedGoal =
    campaign.totalRaised >= campaign.goal;

  // La finalisation peut être différée :
  // le statut reste Active jusqu'à une transaction.
  const effectivelyFailed =
    campaign.status === 2n ||
    (
      campaign.status === 0n &&
      ended &&
      !reachedGoal
    );

  const effectivelySuccessful =
    campaign.status === 1n ||
    (
      campaign.status === 0n &&
      ended &&
      reachedGoal
    );

  const refundable =
    effectivelyFailed ||
    campaign.status === 3n;

  // Le contrat rembourse selon les CFD possédés,
  // et non selon les contributions historiques.
  const refundableWei = cfdBalance / rate;

  const canRefund =
    refundable &&
    refundableWei > 0n &&
    campaign.availableFunds >= refundableWei;

  const canRequestWithdrawal =
    isBeneficiary &&
    !paused &&
    !campaign.isFrozen &&
    !withdrawal.requested &&
    campaign.availableFunds > 0n &&
    (
      effectivelySuccessful ||
      (
        campaign.status === 0n &&
        !ended &&
        reachedGoal
      )
    );

  return {
    id: id.toString(),

    isBeneficiary,
    paused: Boolean(paused),
    frozen: Boolean(campaign.isFrozen),

    status: Number(campaign.status),
    ended,
    reachedGoal,
    effectivelySuccessful,
    effectivelyFailed,

    cfdBalance: formatUnits(cfdBalance, 18),

    refundableETH: formatEther(refundableWei),
    canRefund,

    canRequestWithdrawal,

    withdrawal: {
      requested: Boolean(withdrawal.requested),
      governanceApproved:
        Boolean(withdrawal.governanceApproved),
      multisigApproved:
        Boolean(withdrawal.multisigApproved),
      grossETH: formatEther(
        withdrawal.grossAmount
      ),
      netETH: formatEther(
        withdrawal.netAmount
      ),
    },
  };
}

// ------------------------------------------------------------
// Attendre une transaction confirmée
// ------------------------------------------------------------

async function sendAndConfirm(
  tx,
  onSubmitted
) {
  onSubmitted?.(tx.hash);

  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error(
      "La transaction n'a pas été confirmée."
    );
  }

  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

// ------------------------------------------------------------
// Vérifier le compte signataire
// ------------------------------------------------------------

async function getAuthorizedCrowdfunding(account) {
  const { signer, crowdfunding } =
    await getWriteContracts();

  const signerAddress =
    await signer.getAddress();

  if (!sameAddress(signerAddress, account)) {
    throw new Error(
      "Le compte MetaMask actif a changé. " +
      "Actualisez la page et réessayez."
    );
  }

  return crowdfunding;
}

// ------------------------------------------------------------
// Bénéficiaire : demander le retrait
// ------------------------------------------------------------

export async function requestCampaignWithdrawal(
  campaignId,
  account,
  onSubmitted
) {
  const id = validId(campaignId);

  const crowdfunding =
    await getAuthorizedCrowdfunding(account);

  // Le smart contract revérifie toutes les
  // permissions au moment de la transaction.
  const tx =
    await crowdfunding.requestWithdrawal(id);

  return sendAndConfirm(tx, onSubmitted);
}

// ------------------------------------------------------------
// Porteur des CFD : demander le remboursement
// ------------------------------------------------------------

export async function refundCampaignCFD(
  campaignId,
  account,
  onSubmitted
) {
  const id = validId(campaignId);

  const crowdfunding =
    await getAuthorizedCrowdfunding(account);

  const tx = await crowdfunding.refund(id);

  return sendAndConfirm(tx, onSubmitted);
}
