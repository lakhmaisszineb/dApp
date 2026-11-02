import { formatUnits } from "ethers";
import {
  getReadContracts,
  getWriteContracts,
} from "./contracts.js";

export const PROPOSAL_TYPES = [
  "Autoriser le retrait",
  "Geler la campagne",
  "Dégeler la campagne",
  "Annuler la campagne",
];

const STATES = [
  "Vote ouvert",
  "Adoptée",
  "Rejetée",
  "Exécutée",
];

function positiveId(value) {
  const text = String(value).trim();

  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error("L'identifiant doit être un entier supérieur à zéro.");
  }

  return BigInt(text);
}

function getWallet() {
  const ethereum = window.ethereum;

  if (Array.isArray(ethereum?.providers)) {
    return ethereum.providers.find((item) => item.isMetaMask);
  }

  return ethereum?.isMetaMask ? ethereum : undefined;
}

// Lecture sans ouvrir de demande de connexion.
export async function getAuthorizedAccount() {
  const wallet = getWallet();

  if (!wallet) return "";

  const accounts = await wallet.request({
    method: "eth_accounts",
  });

  return accounts[0] || "";
}

export async function readProposal(idValue, account = "") {
  const id = positiveId(idValue);
  const { governance, crowdfunding } = await getReadContracts();

  // Toutes les lectures se rapportent au même bloc.
  const provider = governance.runner;
  const block = await provider.getBlock("latest");

  if (!block) {
    throw new Error("Impossible de lire le dernier bloc.");
  }

  const overrides = { blockTag: block.number };

  const p = await governance.proposals(id, overrides);

  const [state, campaign, weight, hasVoted] = await Promise.all([
    governance.getProposalState(id, overrides),
    crowdfunding.campaigns(p.campaignId, overrides),

    account
      ? governance.getVotingWeight(id, account, overrides)
      : Promise.resolve(0n),

    account
      ? governance.hasVoted(id, account, overrides)
      : Promise.resolve(false),
  ]);

  const now = BigInt(block.timestamp);

  // La gouvernance refuse les campagnes payées, échouées ou annulées.
  const campaignOpen =
    !campaign.fundsWithdrawn &&
    (campaign.status === 0n || campaign.status === 1n);

  return {
    id: id.toString(),
    campaignId: p.campaignId.toString(),
    type: PROPOSAL_TYPES[Number(p.proposalType)],
    proposer: p.proposer,
    state: STATES[Number(state)],

    snapshotBlock: p.snapshotBlock.toString(),
    snapshotSupply: formatUnits(p.snapshotSupply, 18),
    quorum: formatUnits(p.quorumRequired, 18),
    forVotes: formatUnits(p.forVotes, 18),
    againstVotes: formatUnits(p.againstVotes, 18),
    participation: formatUnits(p.forVotes + p.againstVotes, 18),
    weight: formatUnits(weight, 18),

    deadline: new Date(
      Number(p.deadline) * 1000
    ).toLocaleString("fr-FR"),

    executableAt: new Date(
      Number(p.executableAt) * 1000
    ).toLocaleString("fr-FR"),

    hasVoted,
    campaignOpen,

    canVote:
      Boolean(account) &&
      campaignOpen &&
      !p.executed &&
      now < p.deadline &&
      weight > 0n &&
      !hasVoted,

    // L'état spécifique de l'action sera revérifié par le contrat.
    canAttemptExecution:
      Boolean(account) &&
      campaignOpen &&
      state === 1n &&
      now >= p.executableAt,
  };
}

// Les 20 dernières propositions de la plateforme.
// Une proposition plus ancienne reste accessible avec son identifiant.
export async function readRecentProposals() {
  const { governance } = await getReadContracts();
  const count = await governance.proposalCount();

  const ids = [];

  for (
    let id = count;
    id > 0n && ids.length < 20;
    id -= 1n
  ) {
    ids.push(id);
  }

  return Promise.all(
    ids.map(async (id) => {
      const p = await governance.proposals(id);

      return {
        id: id.toString(),
        campaignId: p.campaignId.toString(),
        type: PROPOSAL_TYPES[Number(p.proposalType)],
      };
    })
  );
}

async function confirmTransaction(tx, onSubmitted) {
  onSubmitted?.(tx.hash);

  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("La transaction n'a pas réussi.");
  }

  return receipt;
}

export async function createProposal(
  campaignIdValue,
  typeValue,
  onSubmitted
) {
  const campaignId = positiveId(campaignIdValue);
  const type = Number(typeValue);

  if (!Number.isInteger(type) || type < 0 || type > 3) {
    throw new Error("Type de proposition invalide.");
  }

  const { governance } = await getWriteContracts();

  const tx = await governance.createProposal(campaignId, type);
  const receipt = await confirmTransaction(tx, onSubmitted);

  let proposalId = null;
  const address = await governance.getAddress();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) {
      continue;
    }

    try {
      const parsed = governance.interface.parseLog(log);

      if (parsed?.name === "ProposalCreated") {
        proposalId = parsed.args.proposalId.toString();
        break;
      }
    } catch {
      // Ignorer les événements non reconnus.
    }
  }

  return {
    hash: receipt.hash,
    proposalId,
  };
}

export async function voteOnProposal(
  idValue,
  support,
  onSubmitted
) {
  const id = positiveId(idValue);
  const { governance } = await getWriteContracts();

  const tx = await governance.vote(id, support);
  const receipt = await confirmTransaction(tx, onSubmitted);

  return { hash: receipt.hash };
}

export async function executeProposal(idValue, onSubmitted) {
  const id = positiveId(idValue);
  const { governance } = await getWriteContracts();

  const tx = await governance.executeProposal(id);
  const receipt = await confirmTransaction(tx, onSubmitted);

  return { hash: receipt.hash };
}