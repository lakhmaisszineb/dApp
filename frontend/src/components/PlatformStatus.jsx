import { useEffect, useState } from "react";

import { readPlatformStatus } from "../services/contracts.js";

import "../styles/project-pages.css";

export default function PlatformStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    readPlatformStatus()
      .then((result) => {
        if (!active) return;

        setStatus(result);
        setError("");
      })
      .catch(() => {
        if (!active) return;

        setError(
          "Les informations de la plateforme sont momentanément indisponibles."
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const result = await readPlatformStatus();

      setStatus(result);
    } catch {
      setStatus(null);

      setError(
        "Les informations de la plateforme sont momentanément indisponibles."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="wallet-panel platform-panel"
      aria-labelledby="platform-status-title"
      aria-busy={loading}
    >
      <div className="wallet-panel-heading">
        <div>
          <p className="tiwizi-overline">
            La plateforme
          </p>

          <h2 id="platform-status-title">
            État des services
          </h2>
        </div>

        <span
          className={
            error
              ? "platform-badge platform-badge--unavailable"
              : status
                ? "platform-badge"
                : "platform-badge platform-badge--neutral"
          }
        >
          {loading
            ? "Vérification"
            : error
              ? "Indisponible"
              : "Connectée"}
        </span>
      </div>

      {loading && (
        <p role="status">
          Actualisation des informations…
        </p>
      )}

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {status && (
        <>
          <p className="platform-description">
            Les contrats de financement, de gouvernance
            et de signature sont accessibles et reliés.
          </p>

          <dl className="platform-metrics">
            <div>
              <dt>Campagnes créées</dt>
              <dd>{status.campaignCount}</dd>
            </div>

            <div>
              <dt>Propositions de gouvernance</dt>
              <dd>{status.proposalCount}</dd>
            </div>

            <div>
              <dt>Opérations soumises au multisig</dt>
              <dd>{status.transactionCount}</dd>
            </div>

            <div>
              <dt>Opérations de la plateforme</dt>

              <dd className="platform-operation-state">
                {status.paused
                  ? "Suspendues"
                  : "Actives"}
              </dd>
            </div>
          </dl>
        </>
      )}

      <button
        type="button"
        className="platform-refresh-button"
        onClick={refresh}
        disabled={loading}
      >
        {loading
          ? "Actualisation…"
          : "Actualiser les informations"}
      </button>
    </section>
  );
}