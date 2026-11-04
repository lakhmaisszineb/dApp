
import {
  getAuthorizedAccount,
  readProposal,
  readRecentProposals,
} from "./governance.js";

import {
  readMultiSigDashboard,
} from "./multisig.js";

// ============================================================
// TIWIZI — Notifications blockchain
//
// 1. Gouvernance : propositions ouvertes non votées
// 2. Multisig : transactions non exécutées à confirmer
//
// Les ID des deux catégories sont distincts :
// governance:1 et multisig:1
// ============================================================

export async function readGovernanceNotifications(account) {
  if (!account) return [];

  const recent = await readRecentProposals();

  const results = await Promise.allSettled(
    recent.map((item) => readProposal(item.id, account))
  );

  const notifications = [];

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;

    const proposal = result.value;

    // Le service de gouvernance calcule canVote à partir
    // du snapshot, du compte, du statut et de la période.
    if (!proposal.canVote) return;

    notifications.push({
      id: `governance:${proposal.id}`,
      sourceId: String(proposal.id),
      category: "governance",
      campaignId: proposal.campaignId,
      title: `Nouveau vote — Campagne #${proposal.campaignId}`,
      description:
        `Proposition ${proposal.type}. ` +
        "Vous pouvez participer au vote.",
      detail: proposal.deadline
        ? `Fin du vote : ${proposal.deadline}`
        : "Vote disponible",
      url: `/gouvernance?proposal=${proposal.id}`,
    });
  });

  return notifications;
}

export async function readMultiSigNotifications(account) {
  if (!account) return [];

  const dashboard = await readMultiSigDashboard(account, 30);

  // Seuls les trois signataires reçoivent
  // les notifications de confirmation.
  if (!dashboard.isSignataire) {
    return [];
  }

  const notifications = [];

  for (const transaction of dashboard.transactions) {
    // Transaction déjà exécutée : plus de confirmation.
    if (transaction.executed) continue;

    // Le compte a déjà confirmé cette transaction.
    // Inutile de lui demander de confirmer de nouveau.
    if (transaction.hasConfirmed) continue;

    const amount = transaction.valueETH;

    notifications.push({
      id: `multisig:${transaction.id}`,
      sourceId: String(transaction.id),
      category: "multisig",
      transactionId: transaction.id,
      title: `Multisig — Transaction #${transaction.id}`,
      description:
        `Une transaction de ${amount} ETH ` +
        "attend votre confirmation.",
      detail:
        `${transaction.confirmationCount}/2 ` +
        "confirmation(s) requise(s) obtenue(s)",
      url: `/multisig?transaction=${transaction.id}`,
    });
  }

  return notifications;
}

// Regrouper les deux catégories sans confondre leurs ID.
export async function readAllNotifications(account) {
  if (!account) return [];

  const results = await Promise.allSettled([
    readGovernanceNotifications(account),
    readMultiSigNotifications(account),
  ]);

  const notifications = [];
  const errors = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      notifications.push(...result.value);
    } else {
      errors.push(result.reason);
    }
  }

  // Si les deux services échouent, signaler une erreur
  // plutôt que d'afficher faussement une liste vide.
  if (errors.length === 2) {
    throw new Error(
      "Impossible de lire les notifications blockchain."
    );
  }

  return {
    notifications,
    partialError:
      errors.length > 0
        ? "Certaines notifications n'ont pas pu être chargées."
        : "",
  };
}

// Conserver l'export utilisé dans l'ancien service.
export { getAuthorizedAccount };
