import { useEffect, useState } from "react";
import { readPlatformStatus } from "../services/contracts.js";

export default function PlatformStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result = await readPlatformStatus();

        if (active) {
          setStatus(result);
        }
      } catch (loadError) {
        console.error("Lecture de la plateforme :", loadError);

        if (active) {
          setStatus(null);

          setError(
            "Impossible de lire la plateforme. Vérifie que le nœud " +
            "Hardhat fonctionne et que les contrats sont déployés. " +
            "Le détail est disponible dans la console du navigateur."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  return (
    <section>
      <h2>État de la plateforme</h2>

      {loading && <p>Lecture des contrats…</p>}

      {!loading && error && <p role="alert">{error}</p>}

      {!loading && status && (
        <>
          <p>✅ Contrats accessibles et correctement reliés.</p>

          <dl>
            <dt>Nombre de campagnes</dt>
            <dd>{status.campaignCount}</dd>

            <dt>Nombre de propositions de gouvernance</dt>
            <dd>{status.proposalCount}</dd>

            <dt>Nombre de transactions soumises au multisig</dt>
            <dd>{status.transactionCount}</dd>

            <dt>État des opérations de la plateforme</dt>
            <dd>{status.paused ? "En pause" : "Non suspendues"}</dd>
          </dl>
        </>
      )}

      <button
        disabled={loading}
        onClick={() => setRefreshKey((value) => value + 1)}
      >
        {loading ? "Chargement…" : "Actualiser"}
      </button>
    </section>
  );
}