import { ZeroAddress, formatEther } from "ethers";

import { getReadContracts } from "./contracts.js";

const CONFIGURED_GATEWAY =
  import.meta.env.VITE_PINATA_GATEWAY ||
  "https://gateway.pinata.cloud";

function gatewayBase() {
  const value = CONFIGURED_GATEWAY.trim();

  const url = new URL(
    value.includes("://")
      ? value
      : `https://${value}`
  );

  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("La passerelle IPFS est invalide.");
  }

  return url.origin;
}

/*
 * Accepter uniquement une référence IPFS simple.
 * Une URL externe fournie dans les métadonnées
 * ne devient pas automatiquement une image affichée.
 */
export function projectIPFSURL(reference) {
  if (typeof reference !== "string") {
    return null;
  }

  const cid = reference
    .trim()
    .replace(/^ipfs:\/\//, "");

  const validCID =
    /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid) ||
    /^b[a-z2-7]{20,120}$/.test(cid);

  if (!validCID) {
    return null;
  }

  return `${gatewayBase()}/ipfs/${cid}`;
}

function safeText(value, maxLength) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

async function readPresentation(reference) {
  try {
    const url = projectIPFSURL(reference);

    if (!url) {
      return null;
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();

    if (text.length > 100_000) {
      return null;
    }

    const metadata = JSON.parse(text);

    if (
      !metadata ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    ) {
      return null;
    }

    const fundsUsage = Array.isArray(metadata.fundsUsage)
      ? metadata.fundsUsage
          .slice(0, 10)
          .filter(
            (item) =>
              item &&
              typeof item === "object" &&
              !Array.isArray(item)
          )
          .map((item) => ({
            label: safeText(item.label, 120),
            description: safeText(item.description, 1000),
          }))
      : [];

    return {
      title: safeText(metadata.title, 120),
      summary: safeText(metadata.summary, 300),
      description: safeText(metadata.description, 10000),
      category: safeText(metadata.category, 80),

      imageURL: projectIPFSURL(metadata.image),

      fundsUsage,
    };
  } catch {
    return null;
  }
}

function validateId(value) {
  const text = String(value).trim();

  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error("Cet identifiant de projet est invalide.");
  }

  const id = BigInt(text);

  if (id > (1n << 256n) - 1n) {
    throw new Error("Cet identifiant de projet est invalide.");
  }

  return id;
}

function statusLabel(campaign, timestamp) {
  if (
    campaign.status === 0n &&
    BigInt(timestamp) >= campaign.deadline
  ) {
    return campaign.totalRaised >= campaign.goal
      ? "Objectif atteint — à finaliser"
      : "Objectif non atteint — à finaliser";
  }

  return [
    "Collecte en cours",
    "Réussie",
    "Échouée",
    "Annulée",
  ][Number(campaign.status)] ?? "Statut inconnu";
}

async function readProject(
  crowdfunding,
  id,
  block,
  paused
) {
  const campaign = await crowdfunding.campaigns(id, {
    blockTag: block.number,
  });

  if (campaign.creator === ZeroAddress) {
    throw new Error("Ce projet n’existe pas.");
  }

  const presentation =
    await readPresentation(campaign.ipfsHash);

  const ended =
    BigInt(block.timestamp) >= campaign.deadline;

  const progress =
    campaign.goal > 0n
      ? Number(
          (campaign.totalRaised * 10_000n) /
            campaign.goal
        ) / 100
      : 0;

  return {
    id: id.toString(),

    title:
      presentation?.title ||
      `Campagne #${id}`,

    summary: presentation?.summary || "",
    description: presentation?.description || "",
    category: presentation?.category || "",

    imageURL: presentation?.imageURL || null,
    fundsUsage: presentation?.fundsUsage || [],

    presentationAvailable: presentation !== null,

    metadataURI: campaign.ipfsHash,
    metadataURL: projectIPFSURL(campaign.ipfsHash),

    creator: campaign.creator,
    beneficiary: campaign.beneficiary,
    token: campaign.token,

    goal: formatEther(campaign.goal),
    raised: formatEther(campaign.totalRaised),
    available: formatEther(campaign.availableFunds),

    deadline: Number(campaign.deadline),

    status: statusLabel(campaign, block.timestamp),

    progress: Math.min(100, progress),

    frozen: campaign.isFrozen,
    paid: campaign.fundsWithdrawn,
    paused,

    canContribute:
      campaign.status === 0n &&
      !ended &&
      !campaign.isFrozen &&
      !paused,
  };
}

export async function getProjectDetails(value) {
  const id = validateId(value);

  const { crowdfunding } = await getReadContracts();

  const block =
    await crowdfunding.runner.getBlock("latest");

  if (!block) {
    throw new Error(
      "Impossible de lire les informations du réseau."
    );
  }

  const paused = await crowdfunding.paused({
    blockTag: block.number,
  });

  return readProject(
    crowdfunding,
    id,
    block,
    paused
  );
}

export async function getProjectsPage(before = null) {
  const { crowdfunding } = await getReadContracts();

  const block =
    await crowdfunding.runner.getBlock("latest");

  if (!block) {
    throw new Error(
      "Impossible de lire les informations du réseau."
    );
  }

  const overrides = {
    blockTag: block.number,
  };

  const [count, paused] = await Promise.all([
    crowdfunding.campaignCount(overrides),
    crowdfunding.paused(overrides),
  ]);

  const requested =
    before === null ? count : validateId(before);

  const lastId =
    requested > count ? count : requested;

  const ids = [];

  for (
    let id = lastId;
    id > 0n && ids.length < 9;
    id -= 1n
  ) {
    ids.push(id);
  }

  const projects = await Promise.all(
    ids.map((id) =>
      readProject(
        crowdfunding,
        id,
        block,
        paused
      )
    )
  );

  return {
    projects,

    next:
      lastId > 9n
        ? (lastId - 9n).toString()
        : null,
  };
}