
import {
  useEffect,
  useState,
} from "react";

import { Link } from "react-router";

import {
  BellRing,
  KeyRound,
  Vote,
  Coins,
  Check,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

import { useWallet } from "../contexts/useWallet.js";

import {
  readWithdrawalAlerts,
} from "../services/withdrawalAlerts.js";

import "./WithdrawalAlerts.css";

// ============================================================
// TIWIZI — NOTIFICATIONS BLOCKCHAIN
//
// Retraits : signataires + détenteurs CFD
// Réception de jetons CFD
// Historique et lecture par compte / réseau
// ============================================================

function readStoredIds(key) {
  try {
    const value = JSON.parse(
      localStorage.getItem(key) || "[]"
    );

    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function AlertIcon({ type }) {
  if (type === "multisig") {
    return <KeyRound size={18} />;
  }

  if (type === "governance") {
    return <Vote size={18} />;
  }

  return <Coins size={18} />;
}

export default function WithdrawalAlerts() {
  const {
    account,
    chainId,
    connected,
    correctNetwork,
  } = useWallet();

  const storageKey =
    `tiwizi-activity-alerts:${chainId}:` +
    `${account?.toLowerCase() || "none"}`;

  const ready =
    Boolean(
      account &&
      connected &&
      correctNetwork
    );

  const [alerts, setAlerts] = useState([]);
  const [readIds, setReadIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [incomplete, setIncomplete] = useState(false);
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ----------------------------------------------------------
  // Lire les notifications marquées comme lues
  // ----------------------------------------------------------

  useEffect(() => {
    setReadIds(readStoredIds(storageKey));
    setAlerts([]);
    setOpen(false);
    setErrors([]);
  }, [storageKey]);

  // ----------------------------------------------------------
  // Charger les événements blockchain
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;
    let busy = false;

    if (!ready) {
      setAlerts([]);
      setLoading(false);

      return () => {
        active = false;
      };
    }

    async function refresh() {
      if (busy) return;

      busy = true;
      setLoading(true);

      try {
        const result = await readWithdrawalAlerts(
          account
        );

        if (!active) return;

        setAlerts(result.alerts);
        setErrors(result.errors);
        setIncomplete(result.incomplete);
      } catch (error) {
        if (!active) return;

        setErrors([
          error?.shortMessage ||
          error?.message ||
          "Lecture des notifications impossible.",
        ]);
      } finally {
        busy = false;

        if (active) {
          setLoading(false);
        }
      }
    }

    void refresh();

    // Actualisation automatique quand TIWIZI est ouverte.
    const timer = window.setInterval(
      refresh,
      30000
    );

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    account,
    chainId,
    ready,
    refreshKey,
  ]);

  // ----------------------------------------------------------
  // Marquer une notification comme lue
  // ----------------------------------------------------------

  function markRead(id) {
    const current = readStoredIds(storageKey);

    const next = Array.from(
      new Set([...current, id])
    );

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(next)
      );
    } catch {
      // Stockage désactivé dans le navigateur.
    }

    setReadIds(next);
  }

  const unreadCount = alerts.filter(
    (alert) => !readIds.includes(alert.id)
  ).length;

  if (!ready) {
    return null;
  }

  return (
    <div className="twa-root">
      <button
        type="button"
        className="twa-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label={
          `${unreadCount} notifications blockchain non lues`
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellRing size={19} />

        {unreadCount > 0 && (
          <span className="twa-count">
            {unreadCount > 99
              ? "99+"
              : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="twa-panel">
          <div className="twa-panel-heading">
            <div>
              <h3>Activités blockchain</h3>

              <span>
                {unreadCount} non lue(s)
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setRefreshKey((value) => value + 1)
              }
              disabled={loading}
              title="Actualiser les notifications"
            >
              <RefreshCw size={17} />
            </button>
          </div>

          {loading && (
            <p className="twa-empty" role="status">
              Lecture de la blockchain...
            </p>
          )}

          {errors.map((message) => (
            <p
              className="twa-error"
              role="alert"
              key={message}
            >
              <AlertCircle size={15} />
              {message}
            </p>
          ))}

          {incomplete && (
            <p className="twa-error" role="status">
              <AlertCircle size={15} />
              Historique partiel : certaines données
              n'ont pas pu être récupérées.
            </p>
          )}

          {!loading &&
            !errors.length &&
            alerts.length === 0 && (
              <p className="twa-empty">
                Aucune notification blockchain
                pour ce portefeuille.
              </p>
            )}

          {alerts.map((alert) => {
            const isRead =
              readIds.includes(alert.id);

            return (
              <div
                className={[
                  "twa-item",
                  isRead ? "twa-item-read" : "",
                ].join(" ")}
                key={alert.id}
              >
                <div className="twa-item-icon">
                  <AlertIcon type={alert.type} />
                </div>

                <div className="twa-item-content">
                  <strong>{alert.title}</strong>

                  <p>{alert.message}</p>

                  <div className="twa-item-actions">
                    <Link
                      to={alert.url}
                      onClick={() => {
                        markRead(alert.id);
                        setOpen(false);
                      }}
                    >
                      {alert.type === "multisig"
                        ? "Ouvrir Multisignature"
                        : alert.type === "governance"
                          ? "Ouvrir Gouvernance"
                          : "Voir les CFD reçus"}
                    </Link>

                    {!isRead && (
                      <button
                        type="button"
                        onClick={() =>
                          markRead(alert.id)
                        }
                      >
                        <Check size={15} />
                        Marquer comme lu
                      </button>
                    )}

                    {isRead && (
                      <span className="twa-read-label">
                        Lu
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
