import { useEffect, useRef, useState } from "react";

import {
  PROPOSAL_TYPES,
  getAuthorizedAccount,
  readProposal,
  readRecentProposals,
  createProposal,
  voteOnProposal,
  executeProposal,
} from "../services/governance.js";

function explainError(error) {
  const code = error.code ?? error.info?.error?.code;

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "Demande refusée dans MetaMask.";
  }

  const reason =
    error.reason ||
    error.info?.error?.data?.reason ||
    error.shortMessage ||
    error.message ||
    "Une erreur est survenue.";

  const translations = {
    "No CFD at snapshot":
      "Tu ne possédais pas de voix pour cette campagne au snapshot.",
    "No voting power":
      "Tu ne disposes pas de voix au snapshot de cette proposition.",
    "Already voted":
      "Ce compte a déjà voté sur cette proposition.",
    "Voting period ended":
      "La période de vote est terminée.",
    "Voting period not ended":
      "La période de vote n'est pas encore terminée.",
    "Execution delay not elapsed":
      "Le délai supplémentaire avant exécution n'est pas terminé.",
    "Proposal not succeeded":
      "La proposition n'a pas été adoptée.",
    "No withdrawal requested":
      "Le bénéficiaire doit d'abord demander le retrait dans Crowdfunding.",
    "Only beneficiary":
      "Seul le bénéficiaire peut proposer l'autorisation du retrait.",
    "Campaign not successful":
      "La campagne doit avoir le statut Successful pour cette proposition.",
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

  for (const [text, translation] of Object.entries(translations)) {
    if (String(reason).includes(text)) return translation;
  }

  return reason;
}

export default function GovernanceDashboard() {
  const [campaignId, setCampaignId] = useState("");
  const [type, setType] = useState("1");
  const [proposalId, setProposalId] = useState("");

  const [proposal, setProposal] = useState(null);
  const [recent, setRecent] = useState([]);
  const [account, setAccount] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Invalider une lecture si le compte change pendant son exécution.
  const revision = useRef(0);

  useEffect(() => {
    let active = true;

    const ethereum = window.ethereum;
    const wallet = Array.isArray(ethereum?.providers)
      ? ethereum.providers.find((item) => item.isMetaMask)
      : ethereum?.isMetaMask
        ? ethereum
        : undefined;

    const initialRevision = revision.current;

    getAuthorizedAccount()
      .then((address) => {
        if (active && revision.current === initialRevision) {
          setAccount(address);
        }
      })
      .catch(() => {
        // Le bouton de connexion reste géré par WalletConnection.
      });

    readRecentProposals()
      .then((items) => {
        if (active) setRecent(items);
      })
      .catch(() => {
        if (active) {
          setError("Impossible de charger les propositions récentes.");
        }
      });

    function accountsChanged(accounts) {
      revision.current += 1;
      setAccount(accounts[0] || "");
      setProposal(null);
      setMessage("");
      setError("");
    }

    function chainChanged() {
      revision.current += 1;
      setProposal(null);
      setMessage("");
      setError("");
    }

    wallet?.on("accountsChanged", accountsChanged);
    wallet?.on("chainChanged", chainChanged);

    return () => {
      active = false;
      wallet?.removeListener("accountsChanged", accountsChanged);
      wallet?.removeListener("chainChanged", chainChanged);
    };
  }, []);

  async function loadProposal(id = proposalId) {
    const currentRevision = revision.current;

    setBusy(true);
    setError("");
    setProposal(null);

    try {
      const address = await getAuthorizedAccount();
      const result = await readProposal(id, address);

      if (revision.current === currentRevision) {
        setAccount(address);
        setProposalId(result.id);
        setProposal(result);
      }
    } catch (loadError) {
      setError(explainError(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function refreshList() {
    setBusy(true);
    setError("");

    try {
      setRecent(await readRecentProposals());
    } catch (loadError) {
      setError(explainError(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function performAction(action, successText) {
    setBusy(true);
    setError("");
    setMessage("Confirme l’action dans MetaMask.");

    let result;

    try {
      result = await action((hash) => {
        setMessage(
          `Transaction envoyée : ${hash}. Confirmation en attente…`
        );
      });
    } catch (actionError) {
      setMessage("");
      setError(explainError(actionError));
      setBusy(false);
      return;
    }

    // Une erreur de rafraîchissement ne doit pas masquer
    // le succès d'une transaction déjà confirmée.
    setMessage(`${successText} Transaction : ${result.hash}`);

    try {
      setRecent(await readRecentProposals());

      const id = result.proposalId || proposal?.id;

      if (id) {
        const currentRevision = revision.current;
        const address = await getAuthorizedAccount();
        const updated = await readProposal(id, address);

        if (revision.current === currentRevision) {
          setAccount(address);
          setProposalId(id);
          setProposal(updated);
        }
      }
    } catch {
      setProposal(null);
      setMessage(
        `${successText} Transaction : ${result.hash}. ` +
        "Recharge les données pour voir le nouvel état."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Gouvernance des campagnes</h2>

      <p>
        Les votes utilisent les CFD de la campagne concernée,
        avec le poids enregistré au snapshot.
      </p>

      <p>
        Compte autorisé : {account || "Aucun compte connecté"}
      </p>

      <h3>Créer une proposition</h3>

      <form
        onSubmit={(event) => {
          event.preventDefault();

          void performAction(
            (onSubmitted) =>
              createProposal(campaignId, type, onSubmitted),
            "Proposition créée."
          );
        }}
      >
        <label htmlFor="governance-campaign">
          Identifiant de la campagne
        </label>

        <input
          id="governance-campaign"
          value={campaignId}
          onChange={(event) => setCampaignId(event.target.value)}
          inputMode="numeric"
          placeholder="1"
          disabled={busy}
          required
        />

        <label htmlFor="proposal-type">Décision proposée</label>

        <select
          id="proposal-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          disabled={busy}
        >
          {PROPOSAL_TYPES.map((label, index) => (
            <option key={index} value={String(index)}>
              {label}
            </option>
          ))}
        </select>

        <button type="submit" disabled={busy || !account}>
          Créer avec MetaMask
        </button>
      </form>

      <p>
        Pour une proposition de retrait, le bénéficiaire doit avoir
        déjà demandé le retrait dans Crowdfunding. Les autres
        propositions nécessitent des voix au snapshot.
      </p>

      <h3>Les 20 dernières propositions</h3>

      <button onClick={refreshList} disabled={busy}>
        Actualiser la liste
      </button>

      {recent.length === 0 ? (
        <p>Aucune proposition affichée.</p>
      ) : (
        <ul>
          {recent.map((item) => (
            <li key={item.id}>
              <button
                disabled={busy}
                onClick={() => loadProposal(item.id)}
              >
                #{item.id} — Campagne #{item.campaignId} — {item.type}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Consulter une proposition</h3>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void loadProposal();
        }}
      >
        <label htmlFor="proposal-id">Identifiant de proposition</label>

        <input
          id="proposal-id"
          value={proposalId}
          onChange={(event) => {
            setProposalId(event.target.value);
            setProposal(null);
          }}
          inputMode="numeric"
          disabled={busy}
          required
        />

        <button type="submit" disabled={busy}>
          Charger
        </button>
      </form>

      {proposal && (
        <article>
          <h3>
            Proposition #{proposal.id} — {proposal.type}
          </h3>

          <p>Campagne : #{proposal.campaignId}</p>
          <p>État : {proposal.state}</p>

          <p style={{ overflowWrap: "anywhere" }}>
            Proposant : {proposal.proposer}
          </p>

          <p>Bloc du snapshot : {proposal.snapshotBlock}</p>
          <p>Offre au snapshot : {proposal.snapshotSupply} CFD</p>
          <p>Quorum requis : {proposal.quorum} CFD</p>

          <p>Pour : {proposal.forVotes} CFD</p>
          <p>Contre : {proposal.againstVotes} CFD</p>
          <p>Participation : {proposal.participation} CFD</p>

          <p>Fin du vote : {proposal.deadline}</p>
          <p>Exécution possible à partir du : {proposal.executableAt}</p>

          <p>
            Ton poids au snapshot :{" "}
            {account ? `${proposal.weight} CFD` : "Connecte MetaMask"}
          </p>

          <p>As-tu déjà voté ? {proposal.hasVoted ? "Oui" : "Non"}</p>

          {!proposal.campaignOpen && (
            <p>
              La campagne est payée, échouée ou annulée :
              les actions de gouvernance sont bloquées.
            </p>
          )}

          <div>
            <button
              disabled={busy || !proposal.canVote}
              onClick={() =>
                performAction(
                  (onSubmitted) =>
                    voteOnProposal(proposal.id, true, onSubmitted),
                  "Vote pour enregistré."
                )
              }
            >
              Voter pour
            </button>

            <button
              disabled={busy || !proposal.canVote}
              onClick={() =>
                performAction(
                  (onSubmitted) =>
                    voteOnProposal(proposal.id, false, onSubmitted),
                  "Vote contre enregistré."
                )
              }
            >
              Voter contre
            </button>
          </div>

          <p>
            Le vote ne dépense pas tes CFD. Une adresse ne peut voter
            qu’une fois sur cette proposition.
          </p>

          <button
            disabled={busy || !proposal.canAttemptExecution}
            onClick={() =>
              performAction(
                (onSubmitted) =>
                  executeProposal(proposal.id, onSubmitted),
                "Décision exécutée."
              )
            }
          >
            Exécuter la décision
          </button>

          <p>
            Le contrat revérifie les conditions au moment de
            l’exécution. Une proposition adoptée peut devenir
            inexécutable si la situation de la campagne change.
          </p>

          <button
            disabled={busy}
            onClick={() => loadProposal(proposal.id)}
          >
            Actualiser cette proposition
          </button>
        </article>
      )}

      {busy && <p>Opération en cours…</p>}

      {message && (
        <p role="status" style={{ overflowWrap: "anywhere" }}>
          {message}
        </p>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}