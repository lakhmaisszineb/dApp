
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { Link } from "react-router";

import {
  HandCoins,
  ShieldCheck,
  Send,
  RefreshCw,
  CheckCircle2,
  Clock3,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";

import { useWallet } from "../contexts/useWallet.js";

import {
  readPendingWithdrawalApprovals,
  submitWithdrawalApproval,
} from "../services/withdrawalMultiSig.js";

import "./PendingWithdrawalApprovals.css";

// ============================================================
// TIWIZI — DEMANDES À SOUMETTRE AU MULTISIG
//
// Une demande Crowdfunding peut exister sans qu'une
// transaction MultiSig ait été créée.
// ============================================================

export default function PendingWithdrawalApprovals() {
  const {
    account,
    connected,
    correctNetwork,
  } = useWallet();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  // ----------------------------------------------------------
  // Lecture des demandes de retrait
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;
    let running = false;

    async function load() {
      if (running) return;

      running = true;
      setLoading(true);

      try {
        const result =
          await readPendingWithdrawalApprovals();

        if (!active) return;

        setRequests(result);
        setError("");
      } catch (err) {
        if (!active) return;

        setError(
          err?.shortMessage ||
          err?.message ||
          "Impossible de lire les demandes."
        );
      } finally {
        running = false;

        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    const timer = window.setInterval(
      load,
      30000
    );

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  // ----------------------------------------------------------
  // Soumission au contrat MultiSig
  // ----------------------------------------------------------

  async function submitRequest(request) {
    if (
      !connected ||
      !correctNetwork ||
      !account ||
      busyId
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Soumettre la demande de retrait ` +
      `de la campagne #${request.id} ?\n\n` +
      `Montant brut : ${request.grossETH} ETH\n` +
      `Montant net : ${request.netETH} ETH\n\n` +
      "Cette transaction ne verse pas encore les ETH. " +
      "Elle prépare l'approbation multisignature 2/3."
    );

    if (!confirmed) return;

    setBusyId(request.id);
    setError("");
    setMessage("");

    try {
      const hash =
        await submitWithdrawalApproval(
          request.id,
          account
        );

      setMessage(
        `Demande #${request.id} soumise au MultiSig. ` +
        `Transaction confirmée : ${hash}`
      );

      refresh();
    } catch (err) {
      setError(
        err?.shortMessage ||
        err?.reason ||
        err?.message ||
        "La soumission a échoué."
      );
    } finally {
      setBusyId(null);
    }
  }

  // ----------------------------------------------------------
  // Interface
  // ----------------------------------------------------------

  return (
    <section className="pwa-section">
      <div className="pwa-heading">
        <div className="pwa-heading-title">
          <span className="pwa-heading-icon">
            <HandCoins size={22} />
          </span>

          <div>
            <h2>Demandes de retrait à approuver</h2>

            <p>
              Retraits Crowdfunding nécessitant
              une approbation multisignature.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading || Boolean(busyId)}
          aria-label="Actualiser les demandes de retrait"
          title="Actualiser"
          className="pwa-refresh"
        >
          <RefreshCw size={17} />
        </button>
      </div>

      {loading && (
        <p className="pwa-feedback" role="status">
          Lecture des demandes sur la blockchain...
        </p>
      )}

      {error && (
        <div className="pwa-error" role="alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {message && (
        <div className="pwa-success" role="status">
          <CheckCircle2 size={17} />
          {message}
        </div>
      )}

      {!loading &&
        !error &&
        requests.length === 0 && (
          <div className="pwa-empty">
            <ShieldCheck size={26} />

            <strong>
              Aucune demande en attente
            </strong>

            <p>
              Les demandes de retrait dépassant
              le seuil multisignature apparaîtront ici.
            </p>
          </div>
        )}

      <div className="pwa-list">
        {requests.map((request) => {
          const alreadySubmitted =
            request.transactionId !== null;

          return (
            <article
              className="pwa-card"
              key={request.id}
            >
              <div className="pwa-card-top">
                <div>
                  <span className="pwa-eyebrow">
                    RETRAIT CROWDFUNDING
                  </span>

                  <h3>
                    Campagne #{request.id}
                  </h3>
                </div>

                <span className="pwa-status">
                  {alreadySubmitted
                    ? "Transaction créée"
                    : "À soumettre"}
                </span>
              </div>

              <div className="pwa-metrics">
                <div>
                  <span>Montant brut</span>

                  <strong>
                    {request.grossETH} ETH
                  </strong>
                </div>

                <div>
                  <span>Montant net</span>

                  <strong>
                    {request.netETH} ETH
                  </strong>
                </div>

                <div>
                  <span>Frais de plateforme</span>

                  <strong>
                    {request.feeETH} ETH
                  </strong>
                </div>
              </div>

              <div className="pwa-info">
                <span>
                  <ShieldCheck size={16} />

                  Gouvernance :{" "}
                  {request.governanceApproved
                    ? "Autorisée"
                    : "En attente"}
                </span>

                <span>
                  <Clock3 size={16} />

                  Multisignature :{" "}
                  {alreadySubmitted
                    ? `${request.confirmationCount}/2 confirmations requises`
                    : "Transaction non soumise"}
                </span>
              </div>

              {alreadySubmitted ? (
                <div className="pwa-existing">
                  <CheckCircle2 size={18} />

                  <div>
                    <strong>
                      Transaction MultiSig #
                      {request.transactionId}
                    </strong>

                    <p>
                      {request.transactionExecuted
                        ? "Transaction exécutée. Actualisez l'état du contrat."
                        : "Le deuxième signataire peut maintenant confirmer la transaction."}
                    </p>

                    <Link
                      to={
                        `/multisig?transaction=` +
                        request.transactionId
                      }
                    >
                      Voir la transaction
                      <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="pwa-primary"
                  disabled={
                    !connected ||
                    !correctNetwork ||
                    Boolean(busyId)
                  }
                  onClick={() =>
                    submitRequest(request)
                  }
                >
                  <Send size={17} />

                  {busyId === request.id
                    ? "Confirmation MetaMask..."
                    : "Soumettre au MultiSig"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
