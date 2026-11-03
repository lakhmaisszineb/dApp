
import { getReadContracts, getWriteContracts } from "./contracts.js";

// Lire le statut, les rôles et les statistiques.
export async function readAdminDashboard(account = "") {
  const { crowdfunding } = await getReadContracts();

  const [adminRole, paused, campaignCount, defaultAdminRole] =
    await Promise.all([
      crowdfunding.ADMIN_ROLE(),
      crowdfunding.paused(),
      crowdfunding.campaignCount(),
      crowdfunding.DEFAULT_ADMIN_ROLE(),
    ]);

  const hasAccount = Boolean(account);

  const [isAdmin, isDefaultAdmin] = hasAccount
    ? await Promise.all([
        crowdfunding.hasRole(adminRole, account),
        crowdfunding.hasRole(defaultAdminRole, account),
      ])
    : [false, false];

  return {
    paused,
    campaignCount: campaignCount.toString(),
    isAdmin,
    isDefaultAdmin,
    account,
  };
}

// Vérifier les autorisations à chaque opération.
async function getAuthorizedAdminContract() {
  const { crowdfunding, signer } = await getWriteContracts();

  const account = await signer.getAddress();
  const adminRole = await crowdfunding.ADMIN_ROLE();

  const authorized = await crowdfunding.hasRole(
    adminRole,
    account
  );

  if (!authorized) {
    throw new Error(
      "Ce portefeuille ne possède pas le rôle administrateur."
    );
  }

  return crowdfunding;
}

// Mettre la plateforme en pause.
export async function pausePlatform() {
  const crowdfunding = await getAuthorizedAdminContract();

  if (await crowdfunding.paused()) {
    throw new Error("La plateforme est déjà en pause.");
  }

  const transaction = await crowdfunding.pause();
  const receipt = await transaction.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("La transaction de pause a échoué.");
  }

  return receipt.hash;
}

// Réactiver la plateforme.
export async function resumePlatform() {
  const crowdfunding = await getAuthorizedAdminContract();

  if (!(await crowdfunding.paused())) {
    throw new Error("La plateforme est déjà active.");
  }

  const transaction = await crowdfunding.unpause();
  const receipt = await transaction.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("La transaction de reprise a échoué.");
  }

  return receipt.hash;
}
