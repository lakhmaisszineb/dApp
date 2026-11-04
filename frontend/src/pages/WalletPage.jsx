
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import WalletConnection from "../components/WalletConnection.jsx";
import PlatformStatus from "../components/PlatformStatus.jsx";
import { useWallet } from "../contexts/useWallet.js";
import { readWalletPortfolio } from "../services/wallet.js";

import "./WalletPage.css";

// ============================================================
// TIWIZI WALLET - ESPACE PERSONNEL
// Les montants proviennent des smart contracts.
// ============================================================

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function displayAmount(value, digits = 4) {
  const number = Number(value);

  if (!Number.isFinite(number)) return String(value);

  if (number > 0 && number < 0.0001) {
    return Number(number.toPrecision(4)).toString();
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(number);
}

function StatCard({ icon, label, value, unit, detail }) {
  return (
    <div className="tw-stat-card">
      <div className="tw-stat-top">
        <span className="tw-stat-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="tw-stat-label">{label}</span>
      </div>

      <div className="tw-stat-number" title={`${value} ${unit || ""}`}>
        {displayAmount(value)}
        {unit && <span>{unit}</span>}
      </div>

      <p className="tw-stat-detail">{detail}</p>
    </div>
  );
}

function ProjectCard({ campaign }) {
  const roles = [];

  if (campaign.isCreator) roles.push("Créateur");
  if (campaign.isBeneficiary) roles.push("Bénéficiaire");
  if (campaign.hasContributed) roles.push("Contributeur");
  if (campaign.hasCFD) roles.push("Détenteur CFD");

  const isFinished =
    campaign.statusNumber === 2 ||
    campaign.statusNumber === 3;

  return (
    <article className="tw-project">
      <div className="tw-project-main">
        <div className="tw-project-icon" aria-hidden="true">
          {campaign.isCreator ? "◇" : "◈"}
        </div>

        <div className="tw-project-details">
          <div className="tw-project-title-row">
            <h3>Campagne #{campaign.id}</h3>

            <span
              className={[
                "tw-status",
                isFinished
                  ? "tw-status-finished"
                  : campaign.statusNumber === 1
                    ? "tw-status-success"
                    : "tw-status-active",
              ].join(" ")}
            >
              {campaign.status}
            </span>
          </div>

          <p>{roles.join(" · ")}</p>
          <p className="tw-project-date">
            Échéance : {campaign.deadline}
          </p>
        </div>
      </div>

      <div className="tw-project-balances">
        <div>
          <span>Mes CFD actuels</span>
          <strong title={`${campaign.cfdBalance} CFD`}>
            {displayAmount(campaign.cfdBalance)} CFD
          </strong>
        </div>

        <div>
          <span>Contribution historique</span>
          <strong title={`${campaign.contribution} ETH`}>
            {displayAmount(campaign.contribution)} ETH
          </strong>
        </div>

        <div>
          <span>Financement du projet</span>
          <strong>
            {displayAmount(campaign.totalRaised)} /{" "}
            {displayAmount(campaign.goal)} ETH
          </strong>
        </div>
      </div>

      {campaign.frozen && (
        <p className="tw-notice">
          Cette campagne est actuellement gelée par
          la gouvernance.
        </p>
      )}

      {campaign.refundable && (
        <p className="tw-notice tw-notice-green">
          Vous détenez des CFD potentiellement
          remboursables pour cette campagne.
        </p>
      )}

      {campaign.canRequestWithdrawal && (
        <p className="tw-notice tw-notice-green">
          Vous êtes bénéficiaire d'une campagne réussie.
          Consultez les conditions de retrait.
        </p>
      )}

      <div className="tw-project-actions">
        <Link
          to={`/campagnes/${campaign.id}`}
          className="tw-link-primary"
        >
          Voir le projet <span aria-hidden="true">↗</span>
        </Link>

        <Link
          to="/gouvernance"
          className="tw-link-text"
        >
          Participer aux décisions
        </Link>
      </div>
    </article>
  );
}

export default function WalletPage() {
  const {
    account,
    connected,
    correctNetwork,
  } = useWallet();

  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;

    setPortfolio(null);
    setError("");
    setCopied(false);

    if (!connected || !correctNetwork || !account) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);

    readWalletPortfolio(account)
      .then((result) => {
        if (active) setPortfolio(result);
      })
      .catch((err) => {
        if (active) {
          setError(
            err?.shortMessage ||
            err?.message ||
            "Impossible de charger les informations du portefeuille."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [account, connected, correctNetwork, revision]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="tw-wallet">
      <header className="tw-wallet-header">
        <div>
          <p className="tw-eyebrow">
            TIWIZI / ESPACE PERSONNEL
          </p>
          <h1>Mon portefeuille</h1>
          <p>
            Gérez vos participations et retrouvez vos
            droits au sein des projets TIWIZI.
          </p>
        </div>

        <Link to="/campagnes" className="tw-header-link">
          Explorer les projets <span>↗</span>
        </Link>
      </header>

      {!connected && (
        <section className="tw-empty-panel">
          <div className="tw-empty-symbol">◇</div>
          <h2>Bienvenue dans votre espace</h2>
          <p>
            Connectez votre portefeuille MetaMask pour
            consulter vos ETH, vos CFD et vos campagnes.
          </p>
          <div className="tw-connection-area">
            <WalletConnection />
          </div>
        </section>
      )}

      {connected && !correctNetwork && (
        <section className="tw-empty-panel">
          <h2>Vérifiez votre réseau</h2>
          <p>
            Sélectionnez le réseau TIWIZI dans MetaMask
            pour accéder à vos données blockchain.
          </p>
          <div className="tw-connection-area">
            <WalletConnection />
          </div>
        </section>
      )}

      {connected && correctNetwork && (
        <>
          {/* CARTE DE SOLDE PRINCIPAL */}
          <section className="tw-balance-card">
            <div className="tw-balance-head">
              <div>
                <p className="tw-balance-label">
                  MON SOLDE ETH
                </p>
                <h2 title={portfolio?.ethBalance || ""}>
                  {portfolio
                    ? displayAmount(portfolio.ethBalance, 6)
                    : "—"}
                  <span>ETH</span>
                </h2>
                <p className="tw-balance-note">
                  Solde de votre adresse sur le réseau
                  connecté
                </p>
              </div>

              <div className="tw-balance-emblem">
                Ξ
              </div>
            </div>

            <div className="tw-balance-footer">
              <div className="tw-account-details">
                <span className="tw-online-dot" />
                <span>
                  {shortAddress(account)}
                </span>
                <span className="tw-network-pill">
                  Réseau connecté
                </span>
              </div>

              <div className="tw-balance-buttons">
                <button
                  type="button"
                  onClick={copyAddress}
                >
                  {copied
                    ? "Adresse copiée ✓"
                    : "Copier l'adresse"}
                </button>

                <button
                  type="button"
                  onClick={refresh}
                  disabled={loading}
                >
                  {loading ? "Chargement..." : "Actualiser"}
                </button>
              </div>
            </div>
          </section>

          {error && (
            <div className="tw-error" role="alert">
              {error}
            </div>
          )}

          {loading && (
            <p className="tw-loading" role="status">
              Lecture des données blockchain...
            </p>
          )}

          {portfolio && (
            <>
              {!portfolio.complete && (
                <p className="tw-error" role="alert">
                  {portfolio.failedReads} campagne(s)
                  n'ont pas pu être lues. Les totaux sont
                  potentiellement incomplets.
                </p>
              )}

              {/* INDICATEURS */}
              <section className="tw-section">
                <div className="tw-section-heading">
                  <div>
                    <p className="tw-eyebrow">
                      VUE D'ENSEMBLE
                    </p>
                    <h2>Mes actifs et contributions</h2>
                  </div>
                </div>

                <div className="tw-stats-grid">
                  <StatCard
                    icon="◈"
                    label="CFD détenus"
                    value={portfolio.totalCFD}
                    unit="CFD"
                    detail="Total indicatif, tous projets"
                  />

                  <StatCard
                    icon="↗"
                    label="ETH contribués"
                    value={portfolio.contributedETH}
                    unit="ETH"
                    detail="Historique de mes contributions"
                  />

                  <StatCard
                    icon="▦"
                    label="Campagnes liées"
                    value={portfolio.relatedCampaigns}
                    detail="Mes participations et mes rôles"
                  />

                  <StatCard
                    icon="◇"
                    label="Campagnes créées"
                    value={portfolio.campaignsCreated}
                    detail="Projets que j'ai lancés"
                  />
                </div>
              </section>

              {/* PROJETS DU PORTEFEUILLE */}
              <section className="tw-section">
                <div className="tw-section-heading">
                  <div>
                    <p className="tw-eyebrow">
                      MES PARTICIPATIONS
                    </p>
                    <h2>Mon portefeuille CFD</h2>
                    <p>
                      Retrouvez chaque campagne et ses
                      jetons spécifiques.
                    </p>
                  </div>

                  <span className="tw-count">
                    {portfolio.campaignsWithCFD} avec CFD
                  </span>
                </div>

                {portfolio.campaigns.length === 0 ? (
                  <div className="tw-empty-projects">
                    <div className="tw-empty-symbol">◈</div>
                    <h3>Votre portefeuille de projets est vide</h3>
                    <p>
                      Découvrez les projets, participez à
                      une campagne et recevez vos CFD.
                    </p>
                    <Link
                      className="tw-link-primary"
                      to="/campagnes"
                    >
                      Découvrir les projets ↗
                    </Link>
                  </div>
                ) : (
                  <div className="tw-project-grid">
                    {portfolio.campaigns.map(
                      (campaign) => (
                        <ProjectCard
                          key={campaign.id}
                          campaign={campaign}
                        />
                      )
                    )}
                  </div>
                )}
              </section>

              {/* GOUVERNANCE */}
              <section className="tw-governance-box">
                <div className="tw-governance-icon">
                  ◉
                </div>
                <div className="tw-governance-copy">
                  <h2>Vos CFD vous donnent une voix</h2>
                  <p>
                    Participez aux décisions des campagnes
                    concernées par vos jetons. Le poids
                    des votes est calculé au snapshot.
                  </p>
                </div>

                <Link
                  to="/gouvernance"
                  className="tw-link-primary"
                >
                  Gouvernance ↗
                </Link>
              </section>

              <p className="tw-footer-note">
                Données lues au bloc{" "}
                {portfolio.chainBlock}. Chaque campagne
                possède son propre CFDToken. Les jetons
                ne sont pas interchangeables entre campagnes.
              </p>
            </>
          )}
        </>
      )}

      {/* DÉTAILS DE CONNEXION ET ÉTAT TECHNIQUE */}
      {connected && correctNetwork && (
        <details className="tw-technical-details">
          <summary>
            Paramètres du compte et informations réseau
          </summary>
          <div className="tw-technical-content">
            <WalletConnection />
            <PlatformStatus />
          </div>
        </details>
      )}

      <nav className="tw-bottom-nav">
        <Link to="/campagnes">
          Découvrir les projets
        </Link>
        <Link to="/creer">
          Créer une campagne
        </Link>
        <Link to="/gouvernance">
          Mes décisions
        </Link>
      </nav>
    </main>
  );
}
