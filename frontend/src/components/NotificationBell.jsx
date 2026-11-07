
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Link,
  useLocation,
} from "react-router";

import {
  Bell,
  X,
  Vote,
  KeyRound,
  Coins,
  HandCoins,
  Check,
  CheckCheck,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  BellOff,
} from "lucide-react";

import { useWallet } from "../contexts/useWallet.js";

import {
  readAllNotifications,
} from "../services/notifications.js";

import {
  readWithdrawalAlerts,
} from "../services/withdrawalAlerts.js";

import deployment from "../contracts/deployment.json";

import "./NotificationBell.css";

// ============================================================
// TIWIZI — CLOCHE UNIQUE DE NOTIFICATIONS
//
// Sources :
// - notifications.js : gouvernance et multisignature
// - withdrawalAlerts.js : demandes de retrait et
//   transferts CFD reçus
//
// Toutes les notifications sont fusionnées.
// Les lectures sont enregistrées par compte et réseau.
// ============================================================

const STORAGE_PREFIX = "tiwizi:notifications:read:v2";

function getStorageKey(account, chainId) {
  return [
    STORAGE_PREFIX,
    String(chainId ?? "unknown"),
    String(deployment.crowdfunding).toLowerCase(),
    String(deployment.governance).toLowerCase(),
    String(deployment.multiSig).toLowerCase(),
    String(account || "").toLowerCase(),
  ].join(":");
}

// Clé utilisée auparavant par NotificationBell.
// On conserve les notifications déjà consultées.
function getLegacyStorageKey(account, chainId) {
  return [
    STORAGE_PREFIX,
    String(chainId ?? "unknown"),
    String(deployment.governance).toLowerCase(),
    String(deployment.multiSig).toLowerCase(),
    String(account || "").toLowerCase(),
  ].join(":");
}

function readIds(key) {
  try {
    const data = JSON.parse(
      window.localStorage.getItem(key) || "[]"
    );

    return new Set(
      Array.isArray(data)
        ? data.map(String)
        : []
    );
  } catch {
    return new Set();
  }
}

function getSavedIds(account, chainId) {
  if (!account) return new Set();

  const current = readIds(
    getStorageKey(account, chainId)
  );

  const previous = readIds(
    getLegacyStorageKey(account, chainId)
  );

  return new Set([
    ...current,
    ...previous,
  ]);
}

function saveReadIds(account, chainId, ids) {
  if (!account) return;

  try {
    window.localStorage.setItem(
      getStorageKey(account, chainId),
      JSON.stringify([...ids])
    );
  } catch {
    // Le navigateur peut bloquer localStorage.
  }
}

// ------------------------------------------------------------
// Uniformiser les notifications des deux services
// ------------------------------------------------------------

function normalizeExisting(item) {
  return {
    id: String(item.id),
    category: item.category || "governance",
    title: item.title || "Notification TAAZUR",
    description: item.description || "",
    detail: item.detail || "",
    url: item.url || "/gouvernance",
    blockNumber: Number(item.blockNumber || 0),
    logIndex: Number(item.logIndex || 0),
  };
}

function normalizeActivity(item) {
  return {
    id: String(item.id),
    category: item.type || "activity",
    title: item.title || "Activité blockchain",
    description: item.message || "",
    detail: item.campaignId
      ? `Campagne #${item.campaignId}`
      : "",
    url: item.url || "/mon-espace",
    blockNumber: Number(item.blockNumber || 0),
    logIndex: Number(item.logIndex || 0),
  };
}

function mergeNotifications(first, second) {
  const unique = new Map();

  for (const notification of [
    ...first,
    ...second,
  ]) {
    unique.set(
      String(notification.id),
      notification
    );
  }

  return [...unique.values()].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return b.blockNumber - a.blockNumber;
    }

    return b.logIndex - a.logIndex;
  });
}

// ------------------------------------------------------------
// Icônes Lucide selon les catégories
// ------------------------------------------------------------

function NotificationIcon({ category }) {
  switch (category) {
    case "multisig":
      return <KeyRound size={19} />;

    case "transfer":
      return <Coins size={19} />;

    case "governance":
      return <Vote size={19} />;

    case "signer":
      return <KeyRound size={19} />;

    default:
      return <HandCoins size={19} />;
  }
}

function actionLabel(category) {
  switch (category) {
    case "multisig":
    case "signer":
      return "Ouvrir la multisignature";

    case "transfer":
      return "Voir les jetons reçus";

    case "governance":
      return "Ouvrir la gouvernance";

    default:
      return "Consulter";
  }
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function NotificationBell() {
  const {
    account,
    chainId,
    connected,
    correctNetwork,
  } = useWallet();

  const location = useLocation();

  const [open, setOpen] = useState(false);

  const [notifications, setNotifications] =
    useState([]);

  const [readSet, setReadSet] =
    useState(() => new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const containerRef = useRef(null);

  const latestReadIds = useRef(new Set());

  const ready = Boolean(
    account &&
    connected &&
    correctNetwork
  );

  // ----------------------------------------------------------
  // Mémorisation des notifications consultées
  // ----------------------------------------------------------

  useEffect(() => {
    const ids = getSavedIds(account, chainId);

    latestReadIds.current = ids;
    setReadSet(ids);
    setNotifications([]);
    setError("");
    setOpen(false);
  }, [account, chainId]);

  // ----------------------------------------------------------
  // Lecture des deux services
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;
    let running = false;

    if (!ready) {
      setNotifications([]);
      setLoading(false);

      return () => {
        active = false;
      };
    }

    async function refresh() {
      if (running) return;

      running = true;
      setLoading(true);

      try {
        // Une défaillance d'un service ne doit pas
        // masquer les notifications de l'autre.
        const results = await Promise.allSettled([
          readAllNotifications(account),
          readWithdrawalAlerts(account),
        ]);

        if (!active) return;

        const all = [];
        const problems = [];

        if (results[0].status === "fulfilled") {
          const result = results[0].value;

          all.push(
            ...(result.notifications || []).map(
              normalizeExisting
            )
          );

          if (result.partialError) {
            problems.push(result.partialError);
          }
        } else {
          problems.push(
            "Notifications classiques indisponibles."
          );
        }

        if (results[1].status === "fulfilled") {
          const result = results[1].value;

          all.push(
            ...(result.alerts || []).map(
              normalizeActivity
            )
          );

          if (result.errors?.length) {
            problems.push(...result.errors);
          }

          if (result.incomplete) {
            problems.push(
              "L'historique de certaines activités est partiel."
            );
          }
        } else {
          problems.push(
            "Notifications de retrait et CFD indisponibles."
          );
        }

        setNotifications(
          mergeNotifications(all, [])
        );

        setError(
          [...new Set(problems)].join(" ")
        );
      } catch (err) {
        if (active) {
          setError(
            err?.message ||
            "Impossible de lire les notifications."
          );
        }
      } finally {
        running = false;

        if (active) {
          setLoading(false);
        }
      }
    }

    void refresh();

    // Actualisation toutes les 30 secondes.
    const interval = window.setInterval(
      refresh,
      30000
    );

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    account,
    chainId,
    ready,
    refreshKey,
  ]);

  // ----------------------------------------------------------
  // Fermer le panneau au changement de page
  // ----------------------------------------------------------

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  // ----------------------------------------------------------
  // Fermer avec clic extérieur ou touche Échap
  // ----------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    function closeOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function closeEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      closeOutside
    );

    document.addEventListener(
      "keydown",
      closeEscape
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeOutside
      );

      document.removeEventListener(
        "keydown",
        closeEscape
      );
    };
  }, [open]);

  // ----------------------------------------------------------
  // Marquer une notification comme lue
  // ----------------------------------------------------------

  const markAsRead = useCallback(
    (notificationId) => {
      const id = String(notificationId);

      const next = new Set(
        latestReadIds.current
      );

      next.add(id);

      latestReadIds.current = next;

      saveReadIds(
        account,
        chainId,
        next
      );

      setReadSet(new Set(next));
    },
    [account, chainId]
  );

  // ----------------------------------------------------------
  // Tout marquer comme lu
  // ----------------------------------------------------------

  function markAllRead() {
    const next = new Set(
      latestReadIds.current
    );

    notifications.forEach((notification) => {
      next.add(notification.id);
    });

    latestReadIds.current = next;

    saveReadIds(account, chainId, next);
    setReadSet(new Set(next));
  }

  // ----------------------------------------------------------
  // Notifications non lues
  // ----------------------------------------------------------

  const unread = notifications.filter(
    (notification) =>
      !readSet.has(notification.id)
  );

  const unreadCount = unread.length;

  // ----------------------------------------------------------
  // Interface
  // ----------------------------------------------------------

  return (
    <div
      className="tn-wrapper"
      ref={containerRef}
    >
      {/* UNE SEULE CLOCHE */}

      <button
        type="button"
        className="tn-trigger"
        onClick={() =>
          setOpen((value) => !value)
        }
        aria-label={
          `${unreadCount} notification(s) non lue(s)`
        }
        aria-expanded={open}
        aria-controls="tiwizi-notifications-panel"
        title="Mes notifications TAAZUR"
      >
        <Bell
          size={21}
          strokeWidth={1.8}
          className="tn-bell-icon"
        />

        {unreadCount > 0 && (
          <span className="tn-count">
            {unreadCount > 9
              ? "9+"
              : unreadCount}
          </span>
        )}
      </button>

      {/* PANNEAU DES NOTIFICATIONS */}

      {open && (
        <div
          className="tn-panel"
          id="tiwizi-notifications-panel"
        >
          <div className="tn-panel-heading">
            <div>
              <strong>Mes notifications</strong>

              <p>
                {unreadCount} non lue(s)
              </p>
            </div>

            <button
              type="button"
              className="tn-close"
              onClick={() => setOpen(false)}
              aria-label="Fermer les notifications"
            >
              <X size={18} />
            </button>
          </div>

          {/* UTILISATEUR NON CONNECTÉ */}

          {!connected && (
            <div className="tn-empty">
              <BellOff size={24} />

              <p>
                Connectez MetaMask pour voir
                vos notifications.
              </p>

              <Link
                to="/connexion"
                onClick={() => setOpen(false)}
              >
                Se connecter
              </Link>
            </div>
          )}

          {/* RÉSEAU INCORRECT */}

          {connected && !correctNetwork && (
            <div className="tn-empty">
              Sélectionnez le réseau TAAZUR.
            </div>
          )}

          {/* CONTENU POUR UTILISATEUR CONNECTÉ */}

          {ready && (
            <>
              <div className="tn-unified-tools">
                <button
                  type="button"
                  onClick={() =>
                    setRefreshKey((key) => key + 1)
                  }
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  Actualiser
                </button>

                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                >
                  <CheckCheck size={15} />
                  Tout marquer comme lu
                </button>
              </div>

              {loading && (
                <p
                  className="tn-feedback"
                  role="status"
                >
                  Actualisation blockchain...
                </p>
              )}

              {error && (
                <p
                  className="tn-error"
                  role="alert"
                >
                  <AlertCircle size={15} />
                  {error}
                </p>
              )}

              {!loading &&
                !error &&
                unreadCount === 0 && (
                  <div className="tn-empty">
                    <Check size={25} />

                    <strong>
                      Aucune nouvelle notification
                    </strong>

                    <p>
                      Toutes vos notifications
                      ont été consultées.
                    </p>
                  </div>
                )}

              {/* LISTE UNIQUE */}

              {unreadCount > 0 && (
                <div className="tn-list">
                  {unread.map((item) => (
                    <Link
                      key={item.id}
                      to={item.url}
                      className="tn-item"
                      onClick={() =>
                        markAsRead(item.id)
                      }
                    >
                      <span className="tn-item-symbol">
                        <NotificationIcon
                          category={item.category}
                        />
                      </span>

                      <span className="tn-item-content">
                        <strong>{item.title}</strong>

                        <span>
                          {item.description}
                        </span>

                        {item.detail && (
                          <small>{item.detail}</small>
                        )}

                        <span className="tn-consult-link">
                          {actionLabel(item.category)}
                        </span>
                      </span>

                      <ArrowUpRight
                        size={17}
                        className="tn-arrow"
                      />
                    </Link>
                  ))}
                </div>
              )}

              <div className="tn-panel-footer">
                <Link
                  to="/gouvernance"
                  onClick={() => setOpen(false)}
                >
                  Gouvernance
                </Link>

                <span>·</span>

                <Link
                  to="/multisig"
                  onClick={() => setOpen(false)}
                >
                  Multisig
                </Link>

                <span>·</span>

                <Link
                  to="/mon-espace"
                  onClick={() => setOpen(false)}
                >
                  Mon espace
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
