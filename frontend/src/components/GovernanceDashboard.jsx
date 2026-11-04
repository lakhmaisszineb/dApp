
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import {
  PROPOSAL_TYPES,
  getAuthorizedAccount,
  readProposal,
  readRecentProposals,
  createProposal,
  voteOnProposal,
  executeProposal,
} from "../services/governance.js";

// ============================================================
// TIWIZI - Tableau de bord de gouvernance
// Création, consultation, vote, exécution et notifications
// ============================================================

function explainError(error) {
  const code = error?.code ?? error?.info?.error?.code;

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "Demande refusée dans MetaMask.";
  }

  const reason =
    error?.reason ||
    error?.info?.error?.data?.reason ||
    error?.shortMessage ||
    error?.message ||
    "Une erreur est survenue.";

  const translations = {
    "No CFD at snapshot":
      "Tu ne possédais pas de CFD au snapshot de cette proposition.",
    "No voting power":
      "Tu ne disposes pas de voix pour cette proposition.",
    "Already voted":
      "Ce compte a déjà voté sur cette proposition.",
    "Voting period ended":
      "La période de vote est terminée.",
    "Voting period not ended":
      "La période de vote n'est pas encore terminée.",
    "Execution delay not elapsed":
      "Le délai de sécurité avant exécution n'est pas terminé.",
    "Proposal not succeeded":
      "La proposition n'a pas été adoptée.",
    "No withdrawal requested":
      "Le bénéficiaire doit d'abord demander le retrait.",
    "Only beneficiary":
      "Seul le bénéficiaire peut effectuer cette opération.",
    "Campaign not successful":
      "La campagne doit avoir le statut Successful.",
    "Campaign already frozen":
      "La campagne est déjà gelée.",
    "Campaign not frozen":
      "La campagne n'est pas gelée.",
    "Campaign already paid":
      "Les fonds de cette campagne ont déjà été retirés.",
    "Campaign is final":
      "La campagne est échouée ou annulée.",
    "Proposal does not exist":
      "Cette proposition n'existe pas.",
    "Campaign does not exist":
      "Cette campagne n'existe pas.",
    "Already executed":
      "Cette proposition a déjà été exécutée.",
  };

  for (const [key, translation] of Object.entries(translations)) {
    if (String(reason).includes(key)) {
      return translation;
    }
  }

  return String(reason);
}

function getMetaMaskProvider() {
  const ethereum = window.ethereum;

  if (Array.isArray(ethereum?.providers)) {
    return ethereum.providers.find((provider) => provider.isMetaMask);
  }

  return ethereum?.isMetaMask ? ethereum : undefined;
}

function calculateQuorumProgress(proposal) {
  const participation = Number(proposal.participation || 0);
  const quorum = Number(proposal.quorum || 0);

  if (quorum <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, (participation / quorum) * 100)
  );
}

export default function GovernanceDashboard() {
  // ----------------------------------------------------------
  // Paramètres URL : /gouvernance?proposal=1
  // ----------------------------------------------------------
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedProposalId = searchParams.get("proposal");

  // ----------------------------------------------------------
  // Formulaire de création
  // ----------------------------------------------------------
  const [campaignId, setCampaignId] = useState("");
  const [type, setType] = useState("1");

  // ----------------------------------------------------------
  // Consultation des propositions
  // ----------------------------------------------------------
  const [proposalId, setProposalId] = useState(
    requestedProposalId || ""
  );

  const [proposal, setProposal] = useState(null);
  const [recent, setRecent] = useState([]);
  const [account, setAccount] = useState("");

  // ----------------------------------------------------------
  // États de l'interface
  // ----------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Invalide les anciennes lectures si MetaMask change de compte.
  const revision = useRef(0);

  // ----------------------------------------------------------
  // Charger la liste des propositions
  // ----------------------------------------------------------
  const refreshList = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const items = await readRecentProposals();
      setRecent(items);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // ----------------------------------------------------------
  // Charger une proposition
  // ----------------------------------------------------------
  const loadProposal = useCallback(async (id) => {
    const requestedId = String(id ?? "").trim();

    if (!/^[1-9]\d*$/.test(requestedId)) {
      setError("Saisis un identifiant de proposition valide.");
      return;
    }

    const currentRevision = revision.current;

    setBusy(true);
    setError("");
    setMessage("");
    setProposal(null);

    try {
      const address = await getAuthorizedAccount();

      const result = await readProposal(
        requestedId,
        address
      );

      if (revision.current !== currentRevision) {
        return;
      }

      setAccount(address || "");
      setProposalId(String(result.id));
      setProposal(result);
    } catch (err) {
      if (revision.current === currentRevision) {
        setError(explainError(err));
      }
    } finally {
      if (revision.current === currentRevision) {
        setBusy(false);
      }
    }
  }, []);

  // ----------------------------------------------------------
  // Initialisation : compte MetaMask et propositions récentes
  // ----------------------------------------------------------
  useEffect(() => {
    let active = true;

    const wallet = getMetaMaskProvider();

    const initialRevision = revision.current;

    getAuthorizedAccount()
      .then((address) => {
        if (
          active &&
          revision.current === initialRevision
        ) {
          setAccount(address || "");
        }
      })
      .catch(() => {
        // La connexion est gérée par WalletConnection.
      });

    readRecentProposals()
      .then((items) => {
        if (active) {
          setRecent(items);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "Impossible de charger les propositions récentes."
          );
        }
      });

    function handleAccountsChanged(accounts) {
      revision.current += 1;

      setAccount(accounts?.[0] || "");
      setProposal(null);
      setMessage("");
      setError("");
      setBusy(false);
    }

    function handleChainChanged() {
      revision.current += 1;

      setProposal(null);
      setMessage("");
      setError("");
      setBusy(false);
    }

    wallet?.on("accountsChanged", handleAccountsChanged);
    wallet?.on("chainChanged", handleChainChanged);

    return () => {
      active = false;
      revision.current += 1;

      wallet?.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );

      wallet?.removeListener(
        "chainChanged",
        handleChainChanged
      );
    };
  }, []);

  // ----------------------------------------------------------
  // Ouvrir automatiquement la proposition demandée par URL
  // Exemple : /gouvernance?proposal=1
  // ----------------------------------------------------------
  useEffect(() => {
    if (!requestedProposalId) {
      return;
    }

    void loadProposal(requestedProposalId);
  }, [requestedProposalId, loadProposal]);

  // ----------------------------------------------------------
  // Navigation vers une proposition
  // ----------------------------------------------------------
  function openProposal(id) {
    const selectedId = String(id);

    setProposalId(selectedId);

    if (requestedProposalId === selectedId) {
      void loadProposal(selectedId);
    } else {
      setSearchParams({ proposal: selectedId });
    }
  }

  // ----------------------------------------------------------
  // Exécuter une action blockchain
  // ----------------------------------------------------------
  async function performAction(action, successText) {
    const currentRevision = revision.current;

    setBusy(true);
    setError("");
    setMessage("Confirme la transaction dans MetaMask.");

    let result;

    try {
      result = await action((hash) => {
        if (revision.current === currentRevision) {
          setMessage(
            `Transaction envoyée : ${hash}. ` +
              "Confirmation en attente..."
          );
        }
      });
    } catch (err) {
      if (revision.current === currentRevision) {
        setMessage("");
        setError(explainError(err));
        setBusy(false);
      }
      return;
    }

    if (revision.current !== currentRevision) {
      return;
    }

    setMessage(
      `${successText} Transaction : ${result.hash}`
    );

    // Rafraîchir l'état sans masquer une transaction réussie.
    try {
      const items = await readRecentProposals();

      if (revision.current !== currentRevision) {
        return;
      }

      setRecent(items);

      const id = result.proposalId || proposal?.id;

      if (id) {
        const address = await getAuthorizedAccount();
        const updated = await readProposal(id, address);

        if (revision.current !== currentRevision) {
          return;
        }

        setAccount(address || "");
        setProposalId(String(id));
        setProposal(updated);

        // Une proposition créée peut être ouverte via URL.
        if (result.proposalId) {
          setSearchParams({
            proposal: String(result.proposalId),
          });
        }
      }
    } catch {
      if (revision.current === currentRevision) {
        setMessage(
          `${successText} Transaction : ${result.hash}. ` +
            "Actualise la proposition pour voir son état."
        );
      }
    } finally {
      if (revision.current === currentRevision) {
        setBusy(false);
      }
    }
  }

  // ----------------------------------------------------------
  // Interface
  // ----------------------------------------------------------
  return (
    <section className="governance-dashboard">
      <h2>Gouvernance des campagnes</h2>

      <p>
        Les décisions de TIWIZI sont prises par les
        détenteurs de CFD, avec un poids de vote enregistré
        au snapshot de chaque proposition.
      </p>

      <p style={{ overflowWrap: "anywhere" }}>
        <strong>Compte connecté :</strong>{" "}
        {account || "Aucun compte connecté"}
      </p>

      {/* ================================================== */}
      {/* CRÉER UNE PROPOSITION                              */}
      {/* ================================================== */}

      <h3>Créer une proposition</h3>

      <form
        onSubmit={(event) => {
          event.preventDefault();

          void performAction(
            (onSubmitted) =>
              createProposal(
                campaignId,
                type,
                onSubmitted
              ),
            "Proposition créée."
          );
        }}
      >
        <label htmlFor="governance-campaign">
          Identifiant de la campagne
        </label>

        <input
          id="governance-campaign"
          type="number"
          min="1"
          step="1"
          value={campaignId}
          onChange={(event) =>
            setCampaignId(event.target.value)
          }
          placeholder="Exemple : 1"
          disabled={busy}
          required
        />

        <label htmlFor="proposal-type">
          Décision proposée
        </label>

        <select
          id="proposal-type"
          value={type}
          onChange={(event) =>
            setType(event.target.value)
          }
          disabled={busy}
        >
          {PROPOSAL_TYPES.map((label, index) => (
            <option
              key={index}
              value={String(index)}
            >
              {label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={busy || !account}
        >
          Créer avec MetaMask
        </button>
      </form>

      <p>
        Pour une proposition de retrait, le bénéficiaire
        doit avoir demandé le retrait au préalable.
        Les autres propositions nécessitent les droits
        de vote correspondants.
      </p>

      {/* ================================================== */}
      {/* LISTE DES PROPOSITIONS                             */}
      {/* ================================================== */}

      <h3>Les 20 dernières propositions</h3>

      <button
        type="button"
        onClick={() => void refreshList()}
        disabled={busy}
      >
        Actualiser la liste
      </button>

      {recent.length === 0 ? (
        <p>Aucune proposition affichée.</p>
      ) : (
        <ul>
          {recent.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  openProposal(item.id)
                }
              >
                Proposition #{item.id} — Campagne #
                {item.campaignId} — {item.type}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ================================================== */}
      {/* CONSULTER UNE PROPOSITION                          */}
      {/* ================================================== */}

      <h3>Consulter une proposition</h3>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          openProposal(proposalId);
        }}
      >
        <label htmlFor="proposal-id">
          Identifiant de proposition
        </label>

        <input
          id="proposal-id"
          type="number"
          min="1"
          step="1"
          value={proposalId}
          onChange={(event) => {
            setProposalId(event.target.value);
            setProposal(null);
          }}
          placeholder="Exemple : 1"
          disabled={busy}
          required
        />

        <button
          type="submit"
          disabled={busy}
        >
          Charger
        </button>
      </form>

      {/* ================================================== */}
      {/* DÉTAILS DE LA PROPOSITION                          */}
      {/* ================================================== */}

      {proposal && (
        <article
          id="governance-proposal-details"
          style={{ marginTop: "24px" }}
        >
          <h3>
            Proposition #{proposal.id} — {proposal.type}
          </h3>

          <p>
            <strong>Campagne :</strong> #
            {proposal.campaignId}
          </p>

          <p>
            <strong>État :</strong> {proposal.state}
          </p>

          <p style={{ overflowWrap: "anywhere" }}>
            <strong>Proposant :</strong>{" "}
            {proposal.proposer}
          </p>

          <p>
            <strong>Bloc du snapshot :</strong>{" "}
            {proposal.snapshotBlock}
          </p>

          <p>
            <strong>Offre au snapshot :</strong>{" "}
            {proposal.snapshotSupply} CFD
          </p>

          {/* ---------------------------------------------- */}
          {/* RÉSULTATS DU VOTE                               */}
          {/* ---------------------------------------------- */}

          <div
            style={{
              marginTop: "20px",
              marginBottom: "20px",
            }}
          >
            <h4>Résultats du vote</h4>

            <p>
              Offre au snapshot :{" "}
              {proposal.snapshotSupply} CFD
            </p>

            <p>
              Quorum requis : {proposal.quorum} CFD
            </p>

            <p>
              Participation :{" "}
              {proposal.participation} CFD
            </p>

            <div
              role="progressbar"
              aria-label="Progression vers le quorum"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={calculateQuorumProgress(
                proposal
              )}
              style={{
                width: "100%",
                height: "12px",
                borderRadius: "8px",
                backgroundColor: "#e5e7eb",
                overflow: "hidden",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  width: `${
                    calculateQuorumProgress(proposal)
                  }%`,
                  height: "100%",
                  backgroundColor: "#16a34a",
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            <p>
              <strong>Pour :</strong>{" "}
              {proposal.forVotes} CFD
            </p>

            <p>
              <strong>Contre :</strong>{" "}
              {proposal.againstVotes} CFD
            </p>

            <p>
              <strong>État du vote :</strong>{" "}
              {proposal.state}
            </p>
          </div>

          {/* ---------------------------------------------- */}
          {/* DÉLAIS                                         */}
          {/* ---------------------------------------------- */}

          <p>
            <strong>Fin du vote :</strong>{" "}
            {proposal.deadline}
          </p>

          <p>
            <strong>Exécution possible à partir du :</strong>{" "}
            {proposal.executableAt}
          </p>

          {/* ---------------------------------------------- */}
          {/* DROITS DU COMPTE CONNECTÉ                      */}
          {/* ---------------------------------------------- */}

          <p>
            <strong>Mon poids au snapshot :</strong>{" "}
            {account
              ? `${proposal.weight} CFD`
              : "Connecte MetaMask"}
          </p>

          <p>
            <strong>Ai-je déjà voté ?</strong>{" "}
            {proposal.hasVoted ? "Oui" : "Non"}
          </p>

          {!proposal.campaignOpen && (
            <p role="status">
              La campagne est payée, échouée ou annulée :
              les actions de gouvernance sont bloquées.
            </p>
          )}

          {/* ---------------------------------------------- */}
          {/* ACTIONS DE VOTE                                */}
          {/* ---------------------------------------------- */}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginTop: "20px",
            }}
          >
            <button
              type="button"
              disabled={busy || !proposal.canVote}
              onClick={() =>
                void performAction(
                  (onSubmitted) =>
                    voteOnProposal(
                      proposal.id,
                      true,
                      onSubmitted
                    ),
                  "Vote pour enregistré."
                )
              }
            >
              Voter pour
            </button>

            <button
              type="button"
              disabled={busy || !proposal.canVote}
              onClick={() =>
                void performAction(
                  (onSubmitted) =>
                    voteOnProposal(
                      proposal.id,
                      false,
                      onSubmitted
                    ),
                  "Vote contre enregistré."
                )
              }
            >
              Voter contre
            </button>
          </div>

          <p>
            Le vote ne dépense pas tes CFD.
            Une adresse ne peut voter qu'une fois
            sur cette proposition.
          </p>

          {/* ---------------------------------------------- */}
          {/* EXÉCUTER UNE DÉCISION                          */}
          {/* ---------------------------------------------- */}

          <button
            type="button"
            disabled={
              busy ||
              !proposal.canAttemptExecution
            }
            onClick={() =>
              void performAction(
                (onSubmitted) =>
                  executeProposal(
                    proposal.id,
                    onSubmitted
                  ),
                "Décision exécutée."
              )
            }
          >
            Exécuter la décision
          </button>

          <p>
            Le contrat vérifie de nouveau toutes les
            conditions au moment de l'exécution.
            Une proposition adoptée peut devenir
            inexécutable si la situation change.
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void loadProposal(proposal.id)
            }
          >
            Actualiser cette proposition
          </button>
        </article>
      )}

      {/* ================================================== */}
      {/* MESSAGES                                           */}
      {/* ================================================== */}

      {busy && (
        <p role="status">
          Opération en cours...
        </p>
      )}

      {message && (
        <p
          role="status"
          style={{ overflowWrap: "anywhere" }}
        >
          {message}
        </p>
      )}

      {error && (
        <p role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
