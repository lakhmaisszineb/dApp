
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import PendingWithdrawalApprovals from "../components/PendingWithdrawalApprovals.jsx";

import {
  Link,
  useSearchParams,
} from "react-router";

import { useWallet } from "../contexts/useWallet.js";

import {
  readMultiSigDashboard,
  submitMultiSigTransaction,
  confirmMultiSigTransaction,
  executeMultiSigTransaction,
  explainMultiSigError,
} from "../services/multisig.js";

import "./MultiSigPage.css";

// ============================================================
// TIWIZI — MULTISIGNATURE 2/3
//
// Fonctionnalités :
// - Consultation de la trésorerie
// - Liste des trois signataires
// - Création d'une transaction
// - Confirmation par un autre signataire
// - Exécution après deux confirmations
// - Consultation d'une transaction depuis une notification
// - Mise en évidence de la transaction sélectionnée
// - Gestion des changements de compte MetaMask
// ============================================================

// ------------------------------------------------------------
// Fonctions utilitaires
// ------------------------------------------------------------

function shortAddress(address) {
  if (!address) return "—";

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function displayETH(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number.toLocaleString("fr-FR", {
    maximumFractionDigits: 6,
  });
}

function isValidTransactionId(value) {
  const text = String(value ?? "").trim();

  return /^[1-9]\d*$/.test(text) &&
    Number.isSafeInteger(Number(text));
}

// ============================================================
// CARTE D'UNE TRANSACTION MULTISIGNATURE
// ============================================================

function TransactionCard({
  transaction,
  busy,
  selected,
  onConfirm,
  onExecute,
}) {
  const confirmations = transaction.confirmationCount;
  const completed = transaction.executed;

  const ready = !completed && confirmations >= 2;

  const statusClass = completed
    ? "ms-status ms-status-done"
    : ready
      ? "ms-status ms-status-ready"
      : "ms-status ms-status-pending";

  const statusText = completed
    ? "Exécutée"
    : ready
      ? "Prête à exécuter"
      : "En attente";

  return (
    <article
      id={`ms-transaction-${transaction.id}`}
      className={[
        "ms-transaction",
        selected ? "ms-transaction-selected" : "",
      ].filter(Boolean).join(" ")}
      aria-label={`Transaction multisignature ${transaction.id}`}
    >
      {/* En-tête */}

      <div className="ms-transaction-head">
        <div>
          <span className="ms-eyebrow">
            TRANSACTION #{transaction.id}
          </span>

          <h3>
            {displayETH(transaction.valueETH)} ETH
          </h3>
        </div>

        <span className={statusClass}>
          {statusText}
        </span>
      </div>

      {selected && (
        <p className="ms-selected-message">
          Transaction ouverte depuis une notification.
        </p>
      )}

      {/* Destinataire */}

      <div className="ms-detail">
        <span>Destinataire</span>

        <code title={transaction.to}>
          {transaction.to}
        </code>
      </div>

      {/* Type de transaction */}

      <div className="ms-detail">
        <span>Type</span>

        <strong>
          {transaction.data === "0x"
            ? "Transfert ETH"
            : "Appel de contrat"}
        </strong>
      </div>

      {/* Confirmations */}

      <div className="ms-confirmations">
        <div className="ms-confirmation-title">
          <strong>Confirmations</strong>

          <span>
            {confirmations}/2 requises
          </span>
        </div>

        <div className="ms-progress">
          <div
            className="ms-progress-fill"
            style={{
              width: `${
                Math.min(
                  100,
                  (confirmations / 2) * 100
                )
              }%`,
            }}
          />
        </div>

        {/* Les trois signataires */}

        <div className="ms-signature-list">
          {transaction.confirmations.map(
            (item, index) => (
              <div
                className="ms-signature"
                key={item.address}
              >
                <span
                  className={
                    item.confirmed
                      ? "ms-signature-icon ms-yes"
                      : "ms-signature-icon ms-no"
                  }
                >
                  {item.confirmed ? "✓" : "○"}
                </span>

                <div>
                  <strong>
                    Signataire {index + 1}
                  </strong>

                  <small title={item.address}>
                    {shortAddress(item.address)}
                  </small>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Actions */}

      {!completed && (
        <div className="ms-actions">
          <button
            type="button"
            disabled={
              busy ||
              !transaction.canConfirm
            }
            onClick={() =>
              onConfirm(transaction.id)
            }
          >
            {transaction.hasConfirmed
              ? "Déjà confirmé"
              : "Confirmer"}
          </button>

          <button
            type="button"
            className="ms-primary"
            disabled={
              busy ||
              !transaction.canExecute
            }
            onClick={() =>
              onExecute(transaction.id)
            }
          >
            Exécuter la transaction
          </button>
        </div>
      )}

      {completed && (
        <p className="ms-executed-note">
          Cette transaction a déjà été exécutée
          sur la blockchain.
        </p>
      )}
    </article>
  );
}

// ============================================================
// PAGE PRINCIPALE
// ============================================================

export default function MultiSigPage() {
  const {
    account,
    connected,
    correctNetwork,
  } = useWallet();

  // ----------------------------------------------------------
  // Paramètre URL provenant des notifications
  // Exemple : /multisig?transaction=2
  // ----------------------------------------------------------

  const [searchParams] = useSearchParams();

  const requestedTransactionId =
    searchParams.get("transaction");

  const selectedTransactionId =
    isValidTransactionId(requestedTransactionId)
      ? Number(requestedTransactionId)
      : null;

  // ----------------------------------------------------------
  // États de la page
  // ----------------------------------------------------------

  const [dashboard, setDashboard] = useState(null);

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Révisions de lecture et de session.
  const readRevisionRef = useRef(0);
  const sessionRevisionRef = useRef(0);

  // Empêcher un défilement répété à chaque actualisation.
  const lastScrolledRef = useRef(null);

  // ----------------------------------------------------------
  // Charger les données de la trésorerie
  // ----------------------------------------------------------

  const refresh = useCallback(async () => {
    const revision = ++readRevisionRef.current;
    const session = sessionRevisionRef.current;

    setLoading(true);

    try {
      const data = await readMultiSigDashboard(
        connected && correctNetwork
          ? account
          : null
      );

      if (
        revision !== readRevisionRef.current ||
        session !== sessionRevisionRef.current
      ) {
        return;
      }

      setDashboard(data);
      setError("");
    } catch (err) {
      if (
        revision !== readRevisionRef.current ||
        session !== sessionRevisionRef.current
      ) {
        return;
      }

      setError(explainMultiSigError(err));
      setDashboard(null);
    } finally {
      if (
        revision === readRevisionRef.current &&
        session === sessionRevisionRef.current
      ) {
        setLoading(false);
      }
    }
  }, [account, connected, correctNetwork]);

  // ----------------------------------------------------------
  // Actualisation automatique toutes les 30 secondes
  // ----------------------------------------------------------

  useEffect(() => {
    sessionRevisionRef.current += 1;
    readRevisionRef.current += 1;

    setDashboard(null);
    setError("");
    setMessage("");

    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, 30000);

    return () => {
      readRevisionRef.current += 1;
      sessionRevisionRef.current += 1;

      window.clearInterval(interval);
    };
  }, [refresh]);

  // ----------------------------------------------------------
  // Ouvrir une transaction depuis une notification
  // ----------------------------------------------------------

  useEffect(() => {
    if (!selectedTransactionId) {
      lastScrolledRef.current = null;
      return;
    }

    if (!dashboard) return;

    const exists = dashboard.transactions.some(
      (transaction) =>
        transaction.id === selectedTransactionId
    );

    if (!exists) return;

    const key = String(selectedTransactionId);

    if (lastScrolledRef.current === key) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(
        `ms-transaction-${selectedTransactionId}`
      );

      if (!element) return;

      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      lastScrolledRef.current = key;
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [dashboard, selectedTransactionId]);

  // ----------------------------------------------------------
  // Exécuter une action via MetaMask
  // ----------------------------------------------------------

  async function performAction(action, successText) {
    if (busy || !connected || !correctNetwork) {
      return;
    }

    const session = sessionRevisionRef.current;

    setBusy(true);
    setError("");
    setMessage(
      "Confirme la transaction dans MetaMask."
    );

    try {
      const hash = await action((submittedHash) => {
        if (
          session === sessionRevisionRef.current
        ) {
          setMessage(
            `Transaction envoyée : ${submittedHash}. ` +
            "Confirmation en attente..."
          );
        }
      });

      if (
        session !== sessionRevisionRef.current
      ) {
        return;
      }

      setMessage(
        `${successText} Hash : ${hash}`
      );

      // Recharger après confirmation blockchain.
      await refresh();
    } catch (err) {
      if (
        session === sessionRevisionRef.current
      ) {
        setMessage("");
        setError(explainMultiSigError(err));
      }
    } finally {
      if (
        session === sessionRevisionRef.current
      ) {
        setBusy(false);
      }
    }
  }

  // ----------------------------------------------------------
  // Créer une transaction
  // ----------------------------------------------------------

  function submit(event) {
    event.preventDefault();

    if (
      busy ||
      !dashboard?.isSignataire ||
      !connected ||
      !correctNetwork
    ) {
      return;
    }

    void performAction(
      (onSubmitted) =>
        submitMultiSigTransaction({
          to: to.trim(),
          valueETH: amount,
          onSubmitted,
        }),
      "Transaction créée. Première confirmation enregistrée."
    );
  }

  // ----------------------------------------------------------
  // Confirmer une transaction
  // ----------------------------------------------------------

  function confirm(txId) {
    void performAction(
      (onSubmitted) =>
        confirmMultiSigTransaction(
          txId,
          onSubmitted
        ),
      `Transaction #${txId} confirmée.`
    );
  }

  // ----------------------------------------------------------
  // Exécuter une transaction
  // ----------------------------------------------------------

  function execute(txId) {
    void performAction(
      (onSubmitted) =>
        executeMultiSigTransaction(
          txId,
          onSubmitted
        ),
      `Transaction #${txId} exécutée.`
    );
  }

  // ----------------------------------------------------------
  // Rendu de la page
  // ----------------------------------------------------------

  return (
    <div className="ms-page">

      {/* ================================================ */}
      {/* EN-TÊTE                                          */}
      {/* ================================================ */}

      <div className="ms-hero">
        <div>
          <span className="ms-eyebrow">
            SÉCURITÉ DE LA TRÉSORERIE
          </span>

          <h1>
            Multisignature TIWIZI
          </h1>

          <p>
            Chaque transaction nécessite l'approbation
            d'au moins deux des trois signataires.
          </p>
        </div>

        <button
          className="ms-refresh"
          type="button"
          onClick={() => void refresh()}
          disabled={loading || busy}
        >
          Actualiser
        </button>
      </div>

      {/* ================================================ */}
      {/* MESSAGES                                         */}
      {/* ================================================ */}

      {error && (
        <div
          className="ms-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          className="ms-message"
          role="status"
        >
          {message}
        </div>
      )}

      {/* ================================================ */}
      {/* CONNEXION                                        */}
      {/* ================================================ */}

      {!connected && (
        <div className="ms-info">
          Connecte MetaMask pour confirmer et exécuter
          les transactions.{" "}

          <Link to="/portefeuille">
            Ouvrir mon portefeuille
          </Link>
        </div>
      )}

      {connected && !correctNetwork && (
        <div className="ms-info">
          Sélectionne le réseau Hardhat Local
          dans MetaMask.
        </div>
      )}

      {loading && !dashboard && (
        <p>
          Chargement de la trésorerie...
        </p>
      )}

      {/* ================================================ */}
      {/* CONTENU DE LA TRÉSORERIE                         */}
      {/* ================================================ */}

      {dashboard && (
        <>

          {/* -------------------------------------------- */}
          {/* STATISTIQUES                                 */}
          {/* -------------------------------------------- */}

          <section className="ms-stats">
            <div className="ms-balance-card">
              <span>
                Solde de la trésorerie
              </span>

              <strong>
                {displayETH(dashboard.balanceETH)} ETH
              </strong>

              <small>
                Fonds détenus par le contrat MultiSig
              </small>
            </div>

            <div className="ms-stat-card">
              <span>
                Transactions créées
              </span>

              <strong>
                {dashboard.transactionCount}
              </strong>
            </div>

            <div className="ms-stat-card">
              <span>
                Seuil de validation
              </span>

              <strong>
                2 sur 3
              </strong>
            </div>
          </section>

          {/* -------------------------------------------- */}
          {/* SIGNATAIRES                                  */}
          {/* -------------------------------------------- */}

          <section className="ms-panel">
            <div className="ms-panel-heading">
              <div>
                <h2>
                  Signataires autorisés
                </h2>

                <p>
                  Les trois adresses ont été définies
                  lors du déploiement.
                </p>
              </div>

              <span
                className={
                  dashboard.isSignataire
                    ? "ms-status ms-status-done"
                    : "ms-status ms-status-pending"
                }
              >
                {dashboard.isSignataire
                  ? "Vous êtes signataire"
                  : "Lecture seule"}
              </span>
            </div>

            <div className="ms-owners">
              {dashboard.signataires.map(
                (signer) => (
                  <div
                    key={signer.address}
                    className="ms-owner"
                  >
                    <span className="ms-owner-avatar">
                      {signer.index}
                    </span>

                    <div>
                      <strong>
                        Signataire {signer.index}
                        {signer.isCurrent
                          ? " — Vous"
                          : ""}
                      </strong>

                      <small title={signer.address}>
                        {signer.address}
                      </small>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>


          {/* ================================================== */}
          {/* DEMANDES DE RETRAIT CROWDFUNDING                  */}
          {/* ================================================== */}

          {dashboard.isSignataire && (
            <PendingWithdrawalApprovals />
          )}

          {/* -------------------------------------------- */}
          {/* PROPOSITION D'UNE TRANSACTION                */}
          {/* -------------------------------------------- */}

          <section className="ms-panel">
            <div className="ms-panel-heading">
              <div>
                <h2>
                  Proposer une transaction
                </h2>

                <p>
                  Le signataire qui crée une transaction
                  apporte automatiquement la première
                  confirmation.
                </p>
              </div>
            </div>

            <form
              className="ms-form"
              onSubmit={submit}
            >
              <label htmlFor="ms-to">
                Adresse du destinataire
              </label>

              <input
                id="ms-to"
                type="text"
                placeholder="0x..."
                value={to}
                onChange={(event) =>
                  setTo(event.target.value)
                }
                required
                disabled={
                  busy ||
                  !dashboard.isSignataire
                }
              />

              <label htmlFor="ms-amount">
                Montant à transférer (ETH)
              </label>

              <input
                id="ms-amount"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                required
                disabled={
                  busy ||
                  !dashboard.isSignataire
                }
              />

              <p className="ms-form-note">
                Seuls les transferts ETH simples
                sont proposés ici.

                Une transaction de 0 ETH peut
                être utilisée pour tester les
                confirmations sans déplacer
                les fonds de la trésorerie.
              </p>

              <button
                className="ms-primary"
                type="submit"
                disabled={
                  busy ||
                  !dashboard.isSignataire ||
                  !connected ||
                  !correctNetwork
                }
              >
                Créer la transaction
              </button>
            </form>
          </section>

          {/* -------------------------------------------- */}
          {/* TRANSACTIONS                                 */}
          {/* -------------------------------------------- */}

          <section className="ms-panel">
            <div className="ms-panel-heading">
              <div>
                <h2>
                  Transactions de la trésorerie
                </h2>

                <p>
                  Historique des 30 dernières
                  transactions enregistrées.
                </p>
              </div>
            </div>

            {loading && (
              <p>
                Actualisation des transactions...
              </p>
            )}

            {selectedTransactionId &&
              !loading &&
              !dashboard.transactions.some(
                (transaction) =>
                  transaction.id === selectedTransactionId
              ) && (
                <div className="ms-info">
                  La transaction #
                  {selectedTransactionId} n'est pas
                  présente dans les 30 dernières
                  transactions affichées.
                </div>
              )}

            {dashboard.transactions.length === 0 ? (
              <div className="ms-empty">
                <strong>
                  Aucune transaction
                </strong>

                <p>
                  Les transactions créées par
                  les signataires apparaîtront ici.
                </p>
              </div>
            ) : (
              <div className="ms-transaction-list">
                {dashboard.transactions.map(
                  (transaction) => (
                    <TransactionCard
                      key={transaction.id}
                      transaction={transaction}
                      selected={
                        transaction.id ===
                        selectedTransactionId
                      }
                      busy={
                        busy ||
                        !connected ||
                        !correctNetwork
                      }
                      onConfirm={confirm}
                      onExecute={execute}
                    />
                  )
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
