
import { ZeroAddress, formatEther } from "ethers";

import { getReadContracts } from "./contracts.js";

// ============================================================
// TIWIZI — SERVICE DES PROJETS ET MÉTADONNÉES IPFS
//
// Fonctionnalités :
// - Validation des références IPFS
// - Lecture sécurisée des métadonnées
// - Lecture des campagnes depuis la blockchain
// - Gestion des échéances compensées
// - Gestion des pauses d'urgence
// - Pagination des campagnes
// ============================================================

// ------------------------------------------------------------
// 1. CONFIGURATION DE LA PASSERELLE IPFS
// ------------------------------------------------------------

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
    throw new Error(
      "La passerelle IPFS est invalide."
    );
  }

  return url.origin;
}

// ------------------------------------------------------------
// 2. TRANSFORMER UNE RÉFÉRENCE IPFS EN URL
// ------------------------------------------------------------

export function projectIPFSURL(reference) {
  if (typeof reference !== "string") {
    return null;
  }

  const cid = reference
    .trim()
    .replace(/^ipfs:\/\//, "");

  // Autoriser uniquement les CID IPFS valides.
  const validCID =
    /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid) ||
    /^b[a-z2-7]{20,120}$/.test(cid);

  if (!validCID) {
    return null;
  }

  return `${gatewayBase()}/ipfs/${cid}`;
}

// ------------------------------------------------------------
// 3. NETTOYAGE DES TEXTES REÇUS D'IPFS
// ------------------------------------------------------------

function safeText(value, maxLength) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

// ------------------------------------------------------------
// 4. LECTURE DES MÉTADONNÉES IPFS
// ------------------------------------------------------------

export async function readPresentation(reference) {
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

    // Limiter la taille des métadonnées.
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

    // Utilisation des fonds.
    const fundsUsage = Array.isArray(
      metadata.fundsUsage
    )
      ? metadata.fundsUsage
          .slice(0, 10)
          .filter(
            (item) =>
              item &&
              typeof item === "object" &&
              !Array.isArray(item)
          )
          .map((item) => ({
            label: safeText(
              item.label,
              120
            ),

            description: safeText(
              item.description,
              1000
            ),
          }))
      : [];

    return {
      title: safeText(
        metadata.title,
        120
      ),

      summary: safeText(
        metadata.summary,
        300
      ),

      description: safeText(
        metadata.description,
        10000
      ),

      category: safeText(
        metadata.category,
        80
      ),

      imageURL: projectIPFSURL(
        metadata.image
      ),

      fundsUsage,
    };

  } catch {
    // L'indisponibilité d'IPFS ne doit pas empêcher
    // l'affichage des données blockchain.
    return null;
  }
}

// ------------------------------------------------------------
// 5. VALIDATION DES IDENTIFIANTS DE CAMPAGNE
// ------------------------------------------------------------

function validateId(value) {
  const text = String(value).trim();

  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error(
      "Cet identifiant de projet est invalide."
    );
  }

  const id = BigInt(text);

  const MAX_UINT256 = (1n << 256n) - 1n;

  if (id > MAX_UINT256) {
    throw new Error(
      "Cet identifiant de projet est invalide."
    );
  }

  return id;
}

// ------------------------------------------------------------
// 6. DÉTERMINER LE STATUT D'UNE CAMPAGNE
// ------------------------------------------------------------

function statusLabel(campaign, effectiveTime) {

  // Une campagne peut avoir dépassé sa date limite
  // sans avoir encore été finalisée sur la blockchain.

  if (
    campaign.status === 0n &&
    effectiveTime >= campaign.deadline
  ) {
    return campaign.totalRaised >= campaign.goal
      ? "Objectif atteint — à finaliser"
      : "Objectif non atteint — à finaliser";
  }

  const statuses = [
    "Collecte en cours",
    "Réussie",
    "Échouée",
    "Annulée",
  ];

  return (
    statuses[Number(campaign.status)] ??
    "Statut inconnu"
  );
}

// ------------------------------------------------------------
// 7. LIRE UNE CAMPAGNE DEPUIS LA BLOCKCHAIN
// ------------------------------------------------------------

async function readProject(
  crowdfunding,
  id,
  block,
  paused,
  effectiveTime
) {
  const overrides = {
    blockTag: block.number,
  };

  // ----------------------------------------------------------
  // Lecture des données du contrat
  // ----------------------------------------------------------

  const [
    campaign,
    effectiveDeadline,
  ] = await Promise.all([
    crowdfunding.campaigns(
      id,
      overrides
    ),

    // Échéance corrigée avec les pauses d'urgence.
    crowdfunding.effectiveDeadline(
      id,
      overrides
    ),
  ]);

  // ----------------------------------------------------------
  // Vérifier l'existence du projet
  // ----------------------------------------------------------

  if (campaign.creator === ZeroAddress) {
    throw new Error(
      "Ce projet n'existe pas."
    );
  }

  // ----------------------------------------------------------
  // Charger les métadonnées IPFS
  // ----------------------------------------------------------

  const presentation =
    await readPresentation(campaign.ipfsHash);

  // ----------------------------------------------------------
  // Vérifier si la campagne est terminée
  // ----------------------------------------------------------

  const ended =
    effectiveTime >= campaign.deadline;

  // ----------------------------------------------------------
  // Calculer la progression de financement
  // ----------------------------------------------------------

  const progress =
    campaign.goal > 0n
      ? Number(
          (
            campaign.totalRaised * 10_000n
          ) / campaign.goal
        ) / 100
      : 0;

  // ----------------------------------------------------------
  // Retourner les informations de la campagne
  // ----------------------------------------------------------

  return {
    id: id.toString(),

    // Métadonnées IPFS
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

    metadataURI:
      campaign.ipfsHash,

    metadataURL:
      projectIPFSURL(campaign.ipfsHash),

    // Informations blockchain
    creator:
      campaign.creator,

    beneficiary:
      campaign.beneficiary,

    token:
      campaign.token,

    goal:
      formatEther(campaign.goal),

    raised:
      formatEther(campaign.totalRaised),

    available:
      formatEther(campaign.availableFunds),

    // Échéance réelle compensée
    deadline:
      Number(effectiveDeadline),

    // Statut réel et logique
    status:
      statusLabel(
        campaign,
        effectiveTime
      ),

    // Pourcentage limité à 100 % pour la barre
    progress:
      Math.min(100, progress),

    frozen:
      Boolean(campaign.isFrozen),

    paid:
      Boolean(campaign.fundsWithdrawn),

    paused:
      Boolean(paused),

    // Vérifier les possibilités de contribution
    canContribute:
      campaign.status === 0n &&
      !ended &&
      !campaign.isFrozen &&
      !paused,
  };
}

// ------------------------------------------------------------
// 8. RÉCUPÉRER LES DÉTAILS D'UNE CAMPAGNE
// ------------------------------------------------------------

export async function getProjectDetails(value) {
  const id = validateId(value);

  const { crowdfunding } =
    await getReadContracts();

  // Lire un bloc stable.
  const block =
    await crowdfunding.runner.getBlock(
      "latest"
    );

  if (!block) {
    throw new Error(
      "Impossible de lire les informations du réseau."
    );
  }

  const overrides = {
    blockTag: block.number,
  };

  const [
    paused,
    effectiveTime,
  ] = await Promise.all([
    // Pause effective, limitée à 24 heures.
    crowdfunding.emergencyPauseActive(
      overrides
    ),

    // Horloge logique.
    crowdfunding.effectiveTime(
      overrides
    ),
  ]);

  return readProject(
    crowdfunding,
    id,
    block,
    paused,
    effectiveTime
  );
}

// ------------------------------------------------------------
// 9. RÉCUPÉRER UNE PAGE DE CAMPAGNES
// ------------------------------------------------------------

export async function getProjectsPage(
  before = null
) {
  const { crowdfunding } =
    await getReadContracts();

  const block =
    await crowdfunding.runner.getBlock(
      "latest"
    );

  if (!block) {
    throw new Error(
      "Impossible de lire les informations du réseau."
    );
  }

  const overrides = {
    blockTag: block.number,
  };

  // Lire toutes les informations sur le même bloc.
  const [
    count,
    paused,
    effectiveTime,
  ] = await Promise.all([
    crowdfunding.campaignCount(
      overrides
    ),

    crowdfunding.emergencyPauseActive(
      overrides
    ),

    crowdfunding.effectiveTime(
      overrides
    ),
  ]);

  // Déterminer le dernier identifiant à afficher.
  const requested =
    before === null
      ? count
      : validateId(before);

  const lastId =
    requested > count
      ? count
      : requested;

  // Construire la liste des neuf campagnes.
  const ids = [];

  for (
    let id = lastId;
    id > 0n && ids.length < 9;
    id -= 1n
  ) {
    ids.push(id);
  }

  // Charger les projets et leurs métadonnées IPFS.
  const projects = await Promise.all(
    ids.map((id) =>
      readProject(
        crowdfunding,
        id,
        block,
        paused,
        effectiveTime
      )
    )
  );

  return {
    projects,

    // Conserver la pagination.
    next:
      lastId > 9n
        ? (lastId - 9n).toString()
        : null,
  };
}
