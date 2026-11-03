
import { useCallback, useEffect, useState } from "react";

import {
  readAdminDashboard,
  pausePlatform,
  resumePlatform,
} from "../services/admin.js";

export default function AdminPage() {
  const [account, setAccount] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

      const data = await readAdminDashboard(currentAccount);
      setDashboard(data);
    } catch (err) {
      setDashboard(null);
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

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const hash =
        action === "pause"
          ? await pausePlatform()
          : await resumePlatform();

      setSuccess(
        action === "pause"
          ? `Plateforme mise en pause. Transaction : ${hash}`
          : `Plateforme réactivée. Transaction : ${hash}`
      );

      await refresh();
    } catch (err) {
      setError(
        err?.code === 4001 || err?.code === "ACTION_REJECTED"
          ? "Transaction annulée dans MetaMask."
          : err?.shortMessage ||
              err?.message ||
              "Opération impossible."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        maxWidth: "950px",
        margin: "0 auto",
        padding: "32px 20px",
      }}
    >
      <p style={{ color: "#64748b" }}>
        Tiwizi / Administration
      </p>

      <h1>Administration de la plateforme</h1>

      <p>
        Gérez les opérations sensibles de la plateforme
        grâce aux autorisations enregistrées sur Ethereum.
      </p>

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {success && (
        <p role="status" style={{ color: "#15803d" }}>
          {success}
        </p>
      )}

      {loading ? (
        <p>Vérification des autorisations...</p>
      ) : (
        <>
          {!account && (
            <div style={panelStyle}>
              <h2>Connexion nécessaire</h2>
              <p>
                Connectez votre portefeuille MetaMask
                pour vérifier vos droits d'administration.
              </p>
              <button onClick={connectWallet}>
                Connecter MetaMask
              </button>
            </div>
          )}

          {account && dashboard && !dashboard.isAdmin && (
            <div style={panelStyle}>
              <h2>Accès non autorisé</h2>
              <p>
                Ce portefeuille ne possède pas le rôle
                ADMIN_ROLE dans Crowdfunding.
              </p>
              <p style={{ overflowWrap: "anywhere" }}>
                Adresse : {account}
              </p>
              <p>
                Sélectionnez un compte administrateur
                dans MetaMask.
              </p>
              <button onClick={refresh}>
                Vérifier à nouveau
              </button>
            </div>
          )}

          {account && dashboard?.isAdmin && (
            <>
              <div style={panelStyle}>
                <h2>Tableau de bord</h2>

                <p style={{ overflowWrap: "anywhere" }}>
                  <strong>Administrateur :</strong>{" "}
                  {account}
                </p>

                <p>
                  <strong>Rôle ADMIN_ROLE :</strong>{" "}
                  Autorisé
                </p>

                <p>
                  <strong>Gestion des rôles :</strong>{" "}
                  {dashboard.isDefaultAdmin
                    ? "DEFAULT_ADMIN_ROLE attribué"
                    : "Non attribué"}
                </p>

                <p>
                  <strong>Campagnes créées :</strong>{" "}
                  {dashboard.campaignCount}
                </p>

                <p>
                  <strong>État :</strong>{" "}
                  {dashboard.paused
                    ? "En pause"
                    : "Active"}
                </p>
              </div>

              <div style={panelStyle}>
                <h2>Contrôle d'urgence</h2>

                <p>
                  La pause bloque notamment la création
                  de campagnes et les nouvelles contributions.
                </p>

                <p>
                  <strong>Attention :</strong> certains
                  retraits et remboursements peuvent
                  également être suspendus.
                </p>

                {dashboard.paused ? (
                  <button
                    disabled={busy}
                    onClick={() => performAction("resume")}
                    style={buttonStyle}
                  >
                    {busy
                      ? "Transaction en cours..."
                      : "Réactiver Tiwizi"}
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => performAction("pause")}
                    style={{
                      ...buttonStyle,
                      backgroundColor: "#991b1b",
                    }}
                  >
                    {busy
                      ? "Transaction en cours..."
                      : "Mettre Tiwizi en pause"}
                  </button>
                )}
              </div>

              <button disabled={busy} onClick={refresh}>
                Actualiser les informations
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

const panelStyle = {
  padding: "24px",
  border: "1px solid #d1d5db",
  borderRadius: "14px",
  marginTop: "24px",
  marginBottom: "24px",
};

const buttonStyle = {
  backgroundColor: "#166534",
  color: "#ffffff",
  border: "none",
  borderRadius: "8px",
  padding: "12px 20px",
  cursor: "pointer",
};
