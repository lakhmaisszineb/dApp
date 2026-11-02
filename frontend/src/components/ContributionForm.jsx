import { useState } from "react";

import {
  contributeToCampaign,
  readCampaignForContribution,
} from "../services/contracts.js";

function explainError(error) {
  const code = error.code ?? error.info?.error?.code;

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "Tu as refusé la demande dans MetaMask.";
  }

  if (code === "INSUFFICIENT_FUNDS") {
    return "Solde ETH insuffisant pour la contribution et le gas.";
  }

  return (
    error.reason ||
    error.shortMessage ||
    error.message ||
    "Une erreur est survenue."
  );
}

export default function ContributionForm() {
  const [campaignId, setCampaignId] = useState("");
  const [campaign, setCampaign] = useState(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadCampaign(event) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");
    setCampaign(null);

    try {
      const result = await readCampaignForContribution(campaignId);
      setCampaign(result);
    } catch (loadError) {
      setError(explainError(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function contribute(event) {
    event.preventDefault();

    if (!campaign) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("Confirme la contribution dans MetaMask.");

    try {
      const result = await contributeToCampaign(
        campaign.id,
        amount,
        (hash) => {
          setMessage(
            `Transaction envoyée : ${hash}. En attente de confirmation…`
          );
        }
      );

      setMessage(
        `Contribution confirmée : ${result.hash}` +
        (result.cfdBalance !== null
          ? ` — Solde CFD du compte contributeur : ${result.cfdBalance}`
          : " — Solde CFD temporairement indisponible.")
      );

      setAmount("");

      try {
        const updated = await readCampaignForContribution(campaign.id);
        setCampaign(updated);
      } catch {
        setCampaign(null);

        setMessage(
          `Contribution confirmée : ${result.hash}. ` +
          "Recharge la campagne pour actualiser les données."
        );
      }
    } catch (contributionError) {
      setMessage("");
      setError(explainError(contributionError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Contribuer à une campagne</h2>

      <form onSubmit={loadCampaign}>
        <label htmlFor="campaign-id">
          Identifiant de la campagne
        </label>

        <input
          id="campaign-id"
          type="text"
          inputMode="numeric"
          placeholder="Exemple : 1"
          value={campaignId}
          disabled={busy}
          onChange={(event) => {
            setCampaignId(event.target.value);
            setCampaign(null);
            setMessage("");
            setError("");
          }}
          required
        />

        <button type="submit" disabled={busy}>
          {busy ? "Veuillez patienter…" : "Charger la campagne"}
        </button>
      </form>

      {campaign && (
        <>
          <h3>Campagne #{campaign.id}</h3>

          <p>Objectif : {campaign.goal} ETH</p>
          <p>Montant collecté : {campaign.totalRaised} ETH</p>
          <p>Échéance : {campaign.deadline}</p>
          <p>Statut : {campaign.status}</p>
          <p>Campagne gelée : {campaign.frozen ? "Oui" : "Non"}</p>
          <p>Plateforme en pause : {campaign.paused ? "Oui" : "Non"}</p>
          <p>Taux : 1 ETH donne {campaign.rate} CFD.</p>

          {campaign.canContribute ? (
            <form onSubmit={contribute}>
              <label htmlFor="contribution-amount">
                Montant de la contribution en ETH
              </label>

              <input
                id="contribution-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={busy}
                required
              />

              <p>
                MetaMask demandera la confirmation.
                Le gas s’ajoute au montant contribué.
              </p>

              <button type="submit" disabled={busy}>
                {busy ? "Traitement…" : "Contribuer avec MetaMask"}
              </button>
            </form>
          ) : (
            <p>Cette campagne n’accepte actuellement pas de contributions.</p>
          )}
        </>
      )}

      {message && (
        <p role="status" style={{ overflowWrap: "anywhere" }}>
          {message}
        </p>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}