
import { formatEther } from "ethers";

import {
  getReadContracts,
  getWriteContracts,
} from "./contracts.js";

// ============================================================
// TIWIZI — DEMANDES DE RETRAIT POUR LA MULTISIGNATURE
//
// Lecture des demandes Crowdfunding
// Détection des transactions MultiSig déjà soumises
// Création d'une transaction encodée vers Crowdfunding
//
// Aucune modification de smart contract.
// ============================================================

const MAX_CAMPAIGNS = 200;
const MAX_TRANSACTIONS = 250;
const BATCH_SIZE = 5;

function sameAddress(a, b) {
  return String(a || "").toLowerCase() ===
    String(b || "").toLowerCase();
}

function validId(value) {
  const text = String(value).trim();

  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error("Identifiant de campagne invalide.");
  }

  return BigInt(text);
}

function safeCount(value) {
  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    throw new Error("Compteur blockchain trop important.");
  }

  return number;
}

function isApprovalTransaction(
  transaction,
  crowdfunding,
  campaignId
) {
  const crowdfundingAddress =
    String(crowdfunding.target);

  if (
    !sameAddress(
      transaction.to,
      crowdfundingAddress
    ) ||
    transaction.value !== 0n
  ) {
    return false;
  }

  try {
    const parsed =
      crowdfunding.interface.parseTransaction({
        data: transaction.data,
        value: transaction.value,
      });

    return (
      parsed?.name === "approveWithdrawalMultiSig" &&
      parsed.args[0] === campaignId
    );
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Rechercher une transaction MultiSig correspondant
// à une demande de retrait.
//
// On inclut les transactions déjà exécutées afin de
// ne pas ignorer un historique incohérent.
// ------------------------------------------------------------

async function findSubmittedApprovals(
  crowdfunding,
  multiSig,
  campaignIds,
  blockTag
) {
  const total = safeCount(
    await multiSig.transactionCount({ blockTag })
  );

  if (total > MAX_TRANSACTIONS) {
    throw new Error(
      "Historique MultiSig trop volumineux pour " +
      "une vérification exhaustive. " +
      "La soumission est bloquée pour éviter " +
      "les doublons."
    );
  }

  const transactions = [];

  for (let id = total; id >= 1; id--) {
    transactions.push(id);
  }

  const approvals = new Map();

  for (
    let offset = 0;
    offset < transactions.length;
    offset += BATCH_SIZE
  ) {
    const batch = transactions.slice(
      offset,
      offset + BATCH_SIZE
    );

    const results = await Promise.all(
      batch.map(async (id) => {
        const tx = await multiSig.getTransaction(
          id,
          { blockTag }
        );

        return {
          id,
          to: tx[0],
          value: tx[1],
          data: tx[2],
          executed: Boolean(tx[3]),
          confirmationCount: Number(tx[4]),
        };
      })
    );

    for (const tx of results) {
      for (const campaignId of campaignIds) {
        if (
          isApprovalTransaction(
            tx,
            crowdfunding,
            campaignId
          )
        ) {
          const key = campaignId.toString();

          if (!approvals.has(key)) {
            approvals.set(key, tx);
          }
        }
      }
    }
  }

  return approvals;
}

// ------------------------------------------------------------
// Récupérer les demandes encore en attente
// ------------------------------------------------------------

export async function readPendingWithdrawalApprovals() {
  const {
    crowdfunding,
    multiSig,
  } = await getReadContracts();

  const provider = crowdfunding.runner;
  const block = await provider.getBlock("latest");

  if (!block) {
    throw new Error("Dernier bloc introuvable.");
  }

  const overrides = {
    blockTag: block.number,
  };

  const [countRaw, threshold] =
    await Promise.all([
      crowdfunding.campaignCount(overrides),
      crowdfunding.MULTISIG_THRESHOLD(overrides),
    ]);

  const count = safeCount(countRaw);

  if (count > MAX_CAMPAIGNS) {
    throw new Error(
      "Plus de 200 campagnes : lecture exhaustive " +
      "nécessaire avant de soumettre une approbation."
    );
  }

  const pending = [];

  for (
    let offset = 1;
    offset <= count;
    offset += BATCH_SIZE
  ) {
    const ids = [];

    for (
      let id = offset;
      id <= count &&
      id < offset + BATCH_SIZE;
      id++
    ) {
      ids.push(id);
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        const [campaign, request] =
          await Promise.all([
            crowdfunding.campaigns(
              id,
              overrides
            ),
            crowdfunding.withdrawals(
              id,
              overrides
            ),
          ]);

        if (
          !request.requested ||
          request.multisigApproved ||
          campaign.fundsWithdrawn ||
          request.grossAmount <= threshold
        ) {
          return null;
        }

        return {
          id: String(id),
          campaignId: BigInt(id),
          grossETH: formatEther(
            request.grossAmount
          ),
          netETH: formatEther(
            request.netAmount
          ),
          feeETH: formatEther(
            request.feeAmount
          ),
          governanceApproved:
            Boolean(request.governanceApproved),
          beneficiary: campaign.beneficiary,
        };
      })
    );

    pending.push(
      ...results.filter(Boolean)
    );
  }

  const approvals = await findSubmittedApprovals(
    crowdfunding,
    multiSig,
    pending.map(
      (item) => item.campaignId
    ),
    block.number
  );

  return pending.map((item) => {
    const existing =
      approvals.get(item.id);

    return {
      id: item.id,
      grossETH: item.grossETH,
      netETH: item.netETH,
      feeETH: item.feeETH,
      beneficiary: item.beneficiary,
      governanceApproved:
        item.governanceApproved,

      transactionId:
        existing?.id ?? null,

      confirmationCount:
        existing?.confirmationCount ?? 0,

      transactionExecuted:
        existing?.executed ?? false,
    };
  });
}

// ------------------------------------------------------------
// SOUMETTRE UNE APPROBATION AU MULTISIG
//
// MultiSig.submitTransaction(
//   crowdfundingAddress,
//   0,
//   calldata approveWithdrawalMultiSig(id)
// )
//
// La soumission constitue la première confirmation
// dans le contrat MultiSig existant.
// ------------------------------------------------------------

export async function submitWithdrawalApproval(
  campaignIdValue,
  expectedAccount,
  onSubmitted
) {
  const id = validId(campaignIdValue);

  const {
    signer,
    crowdfunding,
    multiSig,
  } = await getWriteContracts();

  const address = await signer.getAddress();

  if (
    !sameAddress(
      address,
      expectedAccount
    )
  ) {
    throw new Error(
      "Le compte MetaMask a changé."
    );
  }

  if (!(await multiSig.isSignataire(address))) {
    throw new Error(
      "Seul un signataire peut soumettre " +
      "une transaction multisignature."
    );
  }

  // Relire l'état avant la transaction.
  const [
    campaign,
    request,
    threshold,
  ] = await Promise.all([
    crowdfunding.campaigns(id),
    crowdfunding.withdrawals(id),
    crowdfunding.MULTISIG_THRESHOLD(),
  ]);

  if (
    !request.requested ||
    request.multisigApproved ||
    campaign.fundsWithdrawn ||
    request.grossAmount <= threshold
  ) {
    throw new Error(
      "Cette demande ne nécessite plus " +
      "une approbation multisignature."
    );
  }

  // Empêcher une soumission en double.
  const existing = await findSubmittedApprovals(
    crowdfunding,
    multiSig,
    [id],
    "latest"
  );

  if (existing.has(id.toString())) {
    throw new Error(
      "Une transaction d'approbation existe déjà. " +
      "Ouvrez les transactions multisignatures " +
      "pour la confirmer ou l'exécuter."
    );
  }

  // La transaction ne transfère aucun ETH :
  // elle appelle une fonction du contrat Crowdfunding.
  const data =
    crowdfunding.interface.encodeFunctionData(
      "approveWithdrawalMultiSig",
      [id]
    );

  const tx = await multiSig.submitTransaction(
    await crowdfunding.getAddress(),
    0n,
    data
  );

  onSubmitted?.(tx.hash);

  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error(
      "La soumission n'a pas été confirmée."
    );
  }

  return receipt.hash;
}
