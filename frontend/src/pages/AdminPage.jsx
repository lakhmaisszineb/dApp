
import { useCallback, useEffect, useState } from "react";

import {
  readAdminDashboard,
  readPauseHistory,
  pausePlatform,
  resumePlatform,
  closeExpiredPause,
} from "../services/admin.js";

const panelStyle = {
  padding: "24px",
  border: "1px solid #d1d5db",
  borderRadius: "14px",
  marginTop: "20px",
  marginBottom: "20px",
};

const buttonStyle = {
  backgroundColor: "#166534",
  color: "#ffffff",
  border: "none",
  borderRadius: "8px",
  padding: "12px 20px",
  cursor: "pointer",
  marginRight: "10px",
  marginTop: "10px",
};

function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));

  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;

  const parts = [];

  if (days) parts.push(`${days} j`);
  if (hours) parts.push(`${hours} h`);
  if (minutes) parts.push(`${minutes} min`);

  if (!parts.length) {
    parts.push(`${secs} s`);
  }

  return parts.join(" ");
}

function formatDate(timestamp) {
  if (!timestamp) return "Non disponible";

  return new Date(timestamp * 1000).toLocaleString(
    "fr-FR"
  );
}

export default function AdminPage() {
  const [account, setAccount] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historyError, setHistoryError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const wallet = window.ethereum;

      const accounts = wallet
        ? await wallet.request({ method: "eth_accounts" })
        : [];

      const currentAccount = accounts[0] || "";

      setAccount(currentAccount);

      const data = await readAdminDashboard(
        currentAccount
      );

      setDashboard(data);

      try {
        const events = await readPauseHistory();

        setHistory(events);
        setHistoryError("");
      } catch (historyErr) {
        setHistory([]);
        setHistoryError(
          historyErr?.shortMessage ||
            historyErr?.message ||
            "Historique indisponible."
        );
      }
    } catch (err) {
      setDashboard(null);
      setHistory([]);

      setError(
        err?.shortMessage ||
          err?.message ||
          "Impossible de charger l'administration."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const wallet = window.ethereum;

    if (!wallet?.on) return;

    const onChange = () => {
      setSuccess("");
      void refresh();
    };

    wallet.on("accountsChanged", onChange);
    wallet.on("chainChanged", onChange);

    return () => {
      wallet.removeListener?.("accountsChanged", onChange);
      wallet.removeListener?.("chainChanged", onChange);
    };
  }, [refresh]);

  // Actualiser les informations sans recharger la page.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!busy) {
        readAdminDashboard(account)
          .then(setDashboard)
          .catch(() => {
            // Le bouton Actualiser permet de voir
            // le détail si une lecture échoue.
          });
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [account, busy]);

  async function connectWallet() {
    if (!window.ethereum) {
      setError("Installe MetaMask pour continuer.");
      return;
    }

    try {
      setError("");

      await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      await refresh();
    } catch (err) {
      setError(
        err?.code === 4001
          ? "Connexion refusée dans MetaMask."
          : err?.message || "Connexion impossible."
      );
    }
  }

  async function performAction(action) {
    if (busy) return;

    const messages = {
      pause: "Déclencher une pause d'urgence ?",
      resume: "Réactiver TAAZUR avant l'expiration ?",
      expire: "Clôturer la pause expirée ?",
    };

    if (!window.confirm(messages[action])) {
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      let hash;

      if (action === "pause") {
        hash = await pausePlatform();
      } else if (action === "resume") {
        hash = await resumePlatform();
      } else if (action === "expire") {
        hash = await closeExpiredPause();
      } else {
        throw new Error("Action inconnue.");
      }

      setSuccess(
        `Opération confirmée sur Ethereum. Transaction : ${hash}`
      );

      await refresh();
    } catch (err) {
      setError(
        err?.code === 4001 ||
        err?.code === "ACTION_REJECTED"
          ? "Transaction annulée dans MetaMask."
          : err?.shortMessage ||
              err?.message ||
              "Opération impossible."
      );
    } finally {
      setBusy(false);
    }
  }

  const status = dashboard?.emergencyActive
    ? "En pause d'urgence"
    : dashboard?.pauseNeedsClosing
      ? "Pause expirée — clôture disponible"
      : "Active";

  const statusColor = dashboard?.emergencyActive
    ? "#b91c1c"
    : dashboard?.pauseNeedsClosing
      ? "#a16207"
      : "#15803d";

  return (
    <section
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "32px 20px",
      }}
    >
      <p style={{ color: "#64748b" }}>
        TAAZUR / Administration / Sécurité
      </p>

      <h1>Supervision et circuit breaker</h1>

      <p>
        Le circuit breaker protège les opérations sensibles
        de TAAZUR en cas d'incident. La pause est limitée
        à 24 heures et les échéances des campagnes sont
        compensées selon les règles du smart contract.
      </p>

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          style={{
            color: "#15803d",
            overflowWrap: "anywhere",
          }}
        >
          {success}
        </p>
      )}

      {loading && !dashboard ? (
        <p>Chargement des informations blockchain...</p>
      ) : (
        <>
          {!account && (
            <div style={panelStyle}>
              <h2>Connexion MetaMask</h2>

              <p>
                Connecte ton portefeuille pour vérifier
                tes droits d'administration.
              </p>

              <button
                onClick={connectWallet}
                style={buttonStyle}
              >
                Connecter MetaMask
              </button>
            </div>
          )}

          {dashboard && (
            <>
              <div style={panelStyle}>
                <h2>État de TAAZUR</h2>

                <p>
                  <strong>Statut : </strong>
                  <span
                    style={{
                      color: statusColor,
                      fontWeight: "bold",
                    }}
                  >
                    {status}
                  </span>
                </p>

                <p>
                  <strong>Campagnes créées : </strong>
                  {dashboard.campaignCount}
                </p>

                <p>
                  <strong>Pause maximale : </strong>
                  {formatDuration(
                    dashboard.maxPauseDuration
                  )}
                </p>

                <p>
                  <strong>Temps total compensé : </strong>
                  {formatDuration(
                    dashboard.totalPausedSeconds
                  )}
                </p>

                {dashboard.emergencyActive && (
                  <>
                    <p>
                      <strong>Début de la pause : </strong>
                      {dashboard.pauseStartedAtFormatted}
                    </p>

                    <p>
                      <strong>Expiration : </strong>
                      {dashboard.pauseExpiresAtFormatted}
                    </p>

                    <p>
                      <strong>
                        Temps restant approximatif :{" "}
                      </strong>
                      {formatDuration(
                        dashboard.remainingSeconds
                      )}
                    </p>
                  </>
                )}

                {dashboard.pauseNeedsClosing && (
                  <p style={{ color: "#a16207" }}>
                    La limite de 24 heures est atteinte.
                    Les opérations protégées par
                    whenOperational peuvent reprendre.
                    La clôture mettra également à jour
                    l'état de stockage du contrat.
                  </p>
                )}

                {dashboard.hasPausedBefore &&
                  !dashboard.paused && (
                    <p>
                      <strong>
                        Prochaine pause autorisée :{" "}
                      </strong>
                      {
                        dashboard
                          .nextPauseAllowedAtFormatted
                      }
                    </p>
                  )}
              </div>

              {account && !dashboard.isAdmin && (
                <div style={panelStyle}>
                  <h2>Accès administrateur restreint</h2>

                  <p>
                    Ce portefeuille ne possède pas
                    ADMIN_ROLE. Les informations de
                    sécurité restent consultables,
                    mais tu ne peux pas déclencher
                    une pause.
                  </p>

                  <p style={{ overflowWrap: "anywhere" }}>
                    Adresse : {account}
                  </p>

                  <button onClick={refresh}>
                    Vérifier à nouveau
                  </button>
                </div>
              )}

              {dashboard.isAdmin && (
                <div style={panelStyle}>
                  <h2>Contrôle d'urgence</h2>

                  <p style={{ overflowWrap: "anywhere" }}>
                    <strong>Administrateur : </strong>
                    {account}
                  </p>

                  <p>
                    <strong>ADMIN_ROLE : </strong>
                    Autorisé
                  </p>

                  <p>
                    <strong>DEFAULT_ADMIN_ROLE : </strong>
                    {dashboard.isDefaultAdmin
                      ? "Attribué"
                      : "Non attribué"}
                  </p>

                  <p>
                    Pendant une pause active, les
                    contributions et les retraits
                    sont suspendus. Les remboursements
                    légitimes restent possibles.
                  </p>

                  {!dashboard.paused &&
                    dashboard.canStartPause && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          performAction("pause")
                        }
                        style={{
                          ...buttonStyle,
                          backgroundColor: "#991b1b",
                        }}
                      >
                        {busy
                          ? "Transaction en cours..."
                          : "Activer la pause d'urgence"}
                      </button>
                    )}

                  {!dashboard.paused &&
                    !dashboard.canStartPause && (
                      <p style={{ color: "#a16207" }}>
                        Nouvelle pause indisponible :
                        délai anti-abus en cours.
                      </p>
                    )}

                  {dashboard.emergencyActive && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        performAction("resume")
                      }
                      style={buttonStyle}
                    >
                      {busy
                        ? "Transaction en cours..."
                        : "Réactiver TAAZUR"}
                    </button>
                  )}
                </div>
              )}

              {dashboard.pauseNeedsClosing && (
                <div style={panelStyle}>
                  <h2>Clôturer la pause expirée</h2>

                  <p>
                    Cette action est accessible à
                    tout portefeuille connecté :
                    elle n'exige pas ADMIN_ROLE.
                  </p>

                  {account ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        performAction("expire")
                      }
                      style={buttonStyle}
                    >
                      Clôturer la pause expirée
                    </button>
                  ) : (
                    <button
                      onClick={connectWallet}
                      style={buttonStyle}
                    >
                      Connecter MetaMask
                    </button>
                  )}
                </div>
              )}

              <div style={panelStyle}>
                <h2>Historique des interruptions</h2>

                <p>
                  Événements récents enregistrés sur
                  la blockchain locale.
                </p>

                {historyError && (
                  <p style={{ color: "#a16207" }}>
                    {historyError}
                  </p>
                )}

                {!historyError &&
                  history.length === 0 && (
                    <p>
                      Aucun événement trouvé dans
                      les 5 000 derniers blocs.
                    </p>
                  )}

                {history.map((event) => (
                  <div
                    key={`${event.txHash}-${event.type}`}
                    style={{
                      padding: "12px 0",
                      borderBottom:
                        "1px solid #e5e7eb",
                    }}
                  >
                    <strong>{event.type}</strong>

                    <p>
                      {formatDate(event.timestamp)}
                    </p>

                    {event.duration !== null && (
                      <p>
                        Durée compensée :{" "}
                        {formatDuration(
                          event.duration
                        )}
                      </p>
                    )}

                    <p
                      style={{
                        fontSize: "12px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      Transaction : {event.txHash}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <button
        onClick={refresh}
        disabled={busy || loading}
        style={buttonStyle}
      >
        Actualiser les informations
      </button>
    </section>
  );
}
