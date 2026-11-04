
import { useEffect, useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router";

import {
  Wallet,
  ShieldCheck,
  LockKeyhole,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Compass,
  FolderPlus,
  HandCoins,
  Vote,
  Network,
} from "lucide-react";

import { useWallet } from "../contexts/useWallet.js";

import "./ConnectWalletPage.css";

// =====================================================
// TIWIZI — Connexion Web3 avec MetaMask
//
// - Aucun mot de passe
// - Aucun accès à la clé privée
// - Vérification du réseau
// - Redirection vers l'action demandée
// - Utilisation du WalletProvider existant
// =====================================================

function getSafeDestination(from) {
  // Empêcher une redirection vers un site externe.
  if (
    typeof from !== "string" ||
    !from.startsWith("/") ||
    from.startsWith("//") ||
    from.startsWith("/\\") ||
    from.startsWith("/connexion")
  ) {
    return "/portefeuille";
  }

  return from;
}

function Feature({ icon: Icon, title, description }) {
  return (
    <div className="tw-auth-feature">
      <div className="tw-auth-feature-icon">
        <Icon
          size={20}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </div>

      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function ConnectWalletPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    account,
    connected,
    correctNetwork,
    available,
    busy,
    error,
    connect,
    switchNetwork,
  } = useWallet();

  const [localError, setLocalError] = useState("");

  const destination = getSafeDestination(
    location.state?.from
  );

  // Une fois le portefeuille connecté sur le bon réseau,
  // retourner vers la page demandée par l'utilisateur.
  useEffect(() => {
    if (connected && correctNetwork && account) {
      navigate(destination, { replace: true });
    }
  }, [
    account,
    connected,
    correctNetwork,
    destination,
    navigate,
  ]);

  async function handleConnect() {
    setLocalError("");

    try {
      await connect();
      // Le useEffect effectue la redirection lorsque
      // le contexte confirme réellement la connexion.
    } catch (err) {
      setLocalError(
        err?.shortMessage ||
        err?.message ||
        "La connexion au portefeuille a échoué."
      );
    }
  }

  async function handleSwitchNetwork() {
    setLocalError("");

    try {
      await switchNetwork();
    } catch (err) {
      setLocalError(
        err?.shortMessage ||
        err?.message ||
        "Impossible de changer de réseau."
      );
    }
  }

  const displayError = localError || error;

  const needsNetworkSwitch =
    connected && !correctNetwork;

  return (
    <div className="tw-auth-page">
      <div className="tw-auth-container">

        {/* Colonne de présentation */}

        <section className="tw-auth-intro">
          <Link
            to="/"
            className="tw-auth-back"
          >
            <ArrowLeft size={17} />
            Retour à l'accueil
          </Link>

          <div className="tw-auth-label">
            <ShieldCheck
              size={16}
              strokeWidth={1.8}
            />
            IDENTITÉ WEB3
          </div>

          <h1>
            Ensemble, donnons
            <span> vie aux projets.</span>
          </h1>

          <p className="tw-auth-description">
            Rejoignez la communauté TIWIZI.
            Connectez votre portefeuille pour
            soutenir des initiatives, lancer
            vos propres campagnes et participer
            aux décisions collectives.
          </p>

          <div className="tw-auth-features">
            <Feature
              icon={FolderPlus}
              title="Lancez votre projet"
              description="Créez une campagne et mobilisez votre communauté."
            />

            <Feature
              icon={HandCoins}
              title="Soutenez des initiatives"
              description="Contribuez en ETH et recevez les jetons CFD associés."
            />

            <Feature
              icon={Vote}
              title="Participez à la gouvernance"
              description="Votez sur les décisions des campagnes où vous détenez des droits."
            />
          </div>

          <div className="tw-auth-trust">
            <LockKeyhole size={17} />
            <span>
              Votre clé privée reste dans votre portefeuille.
              TIWIZI ne vous la demande jamais.
            </span>
          </div>
        </section>

        {/* Carte de connexion */}

        <section className="tw-auth-card">
          <div className="tw-auth-card-icon">
            <Wallet
              size={30}
              strokeWidth={1.7}
            />
          </div>

          <div className="tw-auth-card-header">
            <span className="tw-auth-overline">
              ACCÈS À LA PLATEFORME
            </span>

            <h2>
              Connectez votre portefeuille
            </h2>

            <p>
              Une connexion simple et sécurisée
              pour utiliser les fonctionnalités
              Web3 de TIWIZI.
            </p>
          </div>

          <div className="tw-auth-wallet-option">
            <div className="tw-auth-wallet-symbol">
              <Wallet
                size={23}
                strokeWidth={1.8}
              />
            </div>

            <div className="tw-auth-wallet-text">
              <strong>MetaMask</strong>

              <span>
                Portefeuille Ethereum
              </span>
            </div>

            {available && (
              <CheckCircle2
                size={20}
                className="tw-auth-wallet-available"
              />
            )}
          </div>

          {displayError && (
            <div
              className="tw-auth-error"
              role="alert"
            >
              <AlertCircle
                size={18}
                aria-hidden="true"
              />
              <span>{displayError}</span>
            </div>
          )}

          {!available && (
            <div className="tw-auth-warning">
              <AlertCircle size={18} />

              <p>
                MetaMask n'a pas été détecté.
                Installez l'extension, puis
                rechargez la page.
              </p>
            </div>
          )}

          {available && !connected && (
            <button
              className="tw-auth-primary"
              type="button"
              disabled={busy}
              onClick={handleConnect}
            >
              {busy ? (
                <>
                  <RefreshCw
                    size={19}
                    className="tw-auth-spin"
                  />
                  Connexion en cours...
                </>
              ) : (
                <>
                  <Wallet size={19} />
                  Se connecter avec MetaMask
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          )}

          {needsNetworkSwitch && (
            <>
              <div className="tw-auth-network-warning">
                <Network size={20} />

                <div>
                  <strong>Réseau incorrect</strong>

                  <p>
                    Sélectionnez le réseau TIWIZI
                    configuré dans votre portefeuille.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="tw-auth-primary"
                disabled={busy}
                onClick={handleSwitchNetwork}
              >
                <Network size={19} />
                Changer de réseau
                <ArrowRight size={18} />
              </button>
            </>
          )}

          {connected && correctNetwork && (
            <div
              className="tw-auth-success"
              role="status"
            >
              <CheckCircle2 size={19} />

              <span>
                Portefeuille connecté.
                Redirection en cours...
              </span>
            </div>
          )}

          {!available && (
            <a
              className="tw-auth-install"
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Installer MetaMask
              <ExternalLink size={16} />
            </a>
          )}

          <div className="tw-auth-divider">
            <span>OU</span>
          </div>

          <Link
            to="/campagnes"
            className="tw-auth-explore"
          >
            <Compass size={18} />
            Explorer sans connexion
          </Link>

          <div className="tw-auth-bottom">
            <ShieldCheck
              size={17}
              aria-hidden="true"
            />

            <p>
              Aucun mot de passe requis.
              Toutes les transactions doivent
              être confirmées dans MetaMask.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
