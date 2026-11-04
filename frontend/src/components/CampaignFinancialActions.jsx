
import {
  useEffect,
  useState,
} from "react";

import {
  HandCoins,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Clock3,
} from "lucide-react";

import { useWallet } from "../contexts/useWallet.js";

import {
  readCampaignFinancialActions,
  requestCampaignWithdrawal,
  refundCampaignCFD,
} from "../services/campaignActions.js";

import "./CampaignFinancialActions.css";

// ============================================================
// TIWIZI — Boutons financiers sécurisés
// ============================================================

export default function CampaignFinancialActions({
  campaignId,
  mode,
}) {
  const {
    account,
    connected,
    correctNetwork,
  } = useWallet();

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [txHash, setTxHash] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // ----------------------------------------------------------
  // Charger les permissions financières
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;

    setDetails(null);
    setError("");
    setSuccess("");
    setTxHash("");
    setLoading(true);

    if (!account || !connected || !correctNetwork) {
      setLoading(false);

      return () => {
        active = false;
      };
    }

    readCampaignFinancialActions(
      campaignId,
      account
    )
      .then((result) => {
        if (active) {
          setDetails(result);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err?.shortMessage ||
            err?.message ||
            "Lecture impossible."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    campaignId,
    account,
    connected,
    correctNetwork,
    refreshKey,
  ]);

  // ----------------------------------------------------------
  // Exécuter une action après confirmation
  // ----------------------------------------------------------

  async function executeAction(kind) {
    if (!details || !account || busy) return;

    const isRefund = kind === "refund";

    if (
      isRefund
        ? !details.canRefund
        : !details.canRequestWithdrawal
    ) {
      return;
    }

    const question = isRefund
      ? (
          "Demander le remboursement de " +
          details.refundableETH +
          " ETH pour la campagne #" +
          campaignId +
          " ? Les CFD correspondants seront brûlés."
        )
      : (
          "Soumettre une demande de retrait pour " +
          "la campagne #" +
          campaignId +
          " ? Cette action ne verse pas encore " +
          "les ETH au bénéficiaire. " +
          "Si l'objectif est atteint avant l'échéance, " +
          "la collecte sera fermée définitivement."
        );

    if (!window.confirm(question)) {
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    setTxHash("");

    try {
      // Revérifier avant d'ouvrir MetaMask.
      const fresh =
        await readCampaignFinancialActions(
          campaignId,
          account
        );

      const permitted = isRefund
        ? fresh.canRefund
        : fresh.canRequestWithdrawal;

      if (!permitted) {
        throw new Error(
          "Cette action n'est plus disponible. " +
          "L'état de la campagne a changé."
        );
      }

      const onSubmitted = (hash) => {
        setTxHash(hash);
      };

      const receipt = isRefund
        ? await refundCampaignCFD(
            campaignId,
            account,
            onSubmitted
          )
        : await requestCampaignWithdrawal(
            campaignId,
            account,
            onSubmitted
          );

      setTxHash(receipt.hash);

      setSuccess(
        isRefund
          ? "Remboursement confirmé sur la blockchain."
          : "Demande de retrait enregistrée. " +
            "Les approbations restent nécessaires."
      );

      setDetails(null);

      // Rafraîchir les données après confirmation.
      const updated =
        await readCampaignFinancialActions(
          campaignId,
          account
        );

      setDetails(updated);
    } catch (err) {
      setError(
        err?.shortMessage ||
        err?.reason ||
        err?.message ||
        "La transaction a échoué."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!connected || !correctNetwork) {
    return null;
  }

  const isRefundMode = mode === "refund";
  const isWithdrawalMode = mode === "withdrawal";

  if (!isRefundMode && !isWithdrawalMode) {
    return null;
  }

  return (
    <div className="tfa-panel">

      <div className="tfa-heading">
        <span>
          {isRefundMode ? (
            <RefreshCw size={17} />
          ) : (
            <HandCoins size={17} />
          )}

          {isRefundMode
            ? "Remboursement CFD"
            : "Gestion du retrait"}
        </span>

        <button
          type="button"
          onClick={() =>
            setRefreshKey((value) => value + 1)
          }
          disabled={loading || busy}
          title="Actualiser les autorisations"
          aria-label="Actualiser les autorisations"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {loading && (
        <p className="tfa-muted" role="status">
          Vérification de la blockchain...
        </p>
      )}

      {!loading && details && (
        <>
          {/* DEMANDE DE RETRAIT */}

          {isWithdrawalMode && (
            <>
              {details.withdrawal.requested ? (
                <div className="tfa-information">
                  <Clock3 size={17} />

                  <div>
                    <strong>
                      Retrait déjà demandé
                    </strong>

                    <p>
                      Montant brut :{" "}
                      {details.withdrawal.grossETH} ETH
                    </p>

                    <p>
                      Montant net :{" "}
                      {details.withdrawal.netETH} ETH
                    </p>

                    <p>
                      Gouvernance :{" "}
                      {details.withdrawal.governanceApproved
                        ? "Autorisée"
                        : "En attente"}
                    </p>

                    <p>
                      Multisignature :{" "}
                      {details.withdrawal.multisigApproved
                        ? "Approuvée"
                        : "Non approuvée ou non requise"}
                    </p>
                  </div>
                </div>
              ) : details.canRequestWithdrawal ? (
                <>
                  <p className="tfa-muted">
                    L'objectif est atteint.
                    Vous pouvez soumettre une
                    demande de retrait.
                  </p>

                  <button
                    type="button"
                    className="tfa-primary"
                    disabled={busy}
                    onClick={() =>
                      executeAction("withdrawal")
                    }
                  >
                    <HandCoins size={17} />

                    {busy
                      ? "Transaction en cours..."
                      : "Demander le retrait"}
                  </button>
                </>
              ) : (
                <p className="tfa-muted">
                  {details.frozen
                    ? "Campagne gelée : retrait indisponible."
                    : details.paused
                      ? "Pause d'urgence active."
                      : !details.reachedGoal
                        ? "L'objectif financier n'est pas encore atteint."
                        : "La demande de retrait n'est pas disponible actuellement."}
                </p>
              )}
            </>
          )}

          {/* REMBOURSEMENT */}

          {isRefundMode && (
            <>
              {details.canRefund ? (
                <>
                  <div className="tfa-refund-amount">
                    <span>
                      Montant remboursable estimé
                    </span>

                    <strong>
                      {details.refundableETH} ETH
                    </strong>
                  </div>

                  <button
                    type="button"
                    className="tfa-primary"
                    disabled={busy}
                    onClick={() =>
                      executeAction("refund")
                    }
                  >
                    <RefreshCw size={17} />

                    {busy
                      ? "Transaction en cours..."
                      : "Demander mon remboursement"}
                  </button>
                </>
              ) : (
                <p className="tfa-muted">
                  {Number(details.cfdBalance) === 0
                    ? "Vous ne détenez plus de CFD pour cette campagne."
                    : "Aucun remboursement n'est actuellement disponible pour ces CFD."}
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* RÉSULTATS */}

      {error && (
        <div className="tfa-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="tfa-success" role="status">
          <CheckCircle2 size={17} />
          <span>{success}</span>
        </div>
      )}

      {txHash && (
        <p className="tfa-tx">
          Transaction :
          <code title={txHash}>
            {txHash.slice(0, 10)}...
            {txHash.slice(-6)}
          </code>
        </p>
      )}
    </div>
  );
}
