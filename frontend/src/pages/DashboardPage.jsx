
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import CampaignFinancialActions from
  "../components/CampaignFinancialActions.jsx";

import {
  BrowserProvider,
  formatEther,
} from "ethers";

import { Link } from "react-router";

import {
  LayoutDashboard,
  Wallet,
  FolderKanban,
  HandCoins,
  Coins,
  Vote,
  PlusCircle,
  ArrowUpRight,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  Copy,
  RefreshCw,
  AlertCircle,
  Compass,
  Network,
  CalendarDays,
  LockKeyhole,
  ExternalLink,
  CircleDollarSign,
  ImageIcon,
  Send,
} from "lucide-react";

import { useWallet } from "../contexts/useWallet.js";
import { useRoles } from "../contexts/useRoles.js";

import {
  readPersonalDashboard,
} from "../services/dashboard.js";

import "./DashboardPage.css";

// ======================================================
// TIWIZI — MON ESPACE PERSONNEL DYNAMIQUE
// ======================================================

function shortAddress(address) {
  if (!address) return "—";

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function displayNumber(value, digits = 4) {
  if (value === null || value === undefined) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
  });
}

function formatDeadline(value) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString(
    "fr-FR",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


function ProjectImage({ src, title }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className="td-project-image">
      {src && !failed ? (
        <img
          src={src}
          alt={title ? `Image du projet : ${title}` : "Image du projet"}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="td-project-image-placeholder"
          role="img"
          aria-label="Image du projet indisponible"
        >
          <ImageIcon
            size={36}
            strokeWidth={1.4}
            aria-hidden="true"
          />

          <span>
            Image indisponible
          </span>
        </div>
      )}
    </div>
  );
}


function getMetaMask() {
  const ethereum = window.ethereum;

  if (Array.isArray(ethereum?.providers)) {
    return ethereum.providers.find(
      (item) => item.isMetaMask
    );
  }

  return ethereum?.isMetaMask
    ? ethereum
    : null;
}

// ------------------------------------------------------
// Petits composants visuels
// ------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}) {
  return (
    <div className="td-stat-card">
      <div className="td-stat-icon">
        <Icon size={21} strokeWidth={1.8} />
      </div>

      <span className="td-stat-label">
        {label}
      </span>

      <strong className="td-stat-value">
        {value}
      </strong>

      <span className="td-stat-detail">
        {detail}
      </span>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  count,
}) {
  return (
    <div className="td-personal-heading">
      <div className="td-personal-heading-main">
        <span className="td-personal-heading-icon">
          <Icon size={22} />
        </span>

        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      {count !== undefined && (
        <span className="td-personal-count">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptySection({
  icon: Icon,
  title,
  description,
  to,
  action,
}) {
  return (
    <div className="td-personal-empty">
      <Icon size={29} strokeWidth={1.5} />

      <strong>{title}</strong>

      <p>{description}</p>

      {to && (
        <Link to={to}>
          {action}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}

function CampaignStatus({ campaign }) {
  let className = "td-personal-status";

  if (
    campaign.statusCode === 1 ||
    campaign.statusCode === 0
  ) {
    className += " td-personal-status-active";
  }

  return (
    <span className={className}>
      {campaign.status}
      {campaign.frozen ? " · Gelée" : ""}
    </span>
  );
}


function CampaignCard({
  campaign,
  type,
}) {
  const isProject = type === "project";
  const isContribution = type === "contribution";
  const isToken = type === "token";

  const goal = Number(campaign.goalETH);
  const raised = Number(campaign.totalRaisedETH);

  const progress =
    goal > 0
      ? Math.max(
          0,
          Math.min(100, (raised / goal) * 100)
        )
      : 0;

  return (
    <article className="td-personal-card td-project-card">

      {/* IMAGE IPFS */}

      <ProjectImage
        src={campaign.imageURL}
        title={campaign.title}
      />

      <div className="td-project-card-content">

        {/* CATÉGORIE ET STATUT */}

        <div className="td-project-card-meta">
          <span className="td-personal-eyebrow">
            {campaign.category || "PROJET"}
            {" · "}
            CAMPAGNE #{campaign.id}
          </span>

          <CampaignStatus campaign={campaign} />
        </div>

        {/* TITRE RÉEL DU PROJET */}

        <h3 className="td-project-title">
          {campaign.title ||
            `Campagne #${campaign.id}`}
        </h3>

        {/* RÉSUMÉ IPFS */}

        {campaign.summary && (
          <p className="td-project-summary">
            {campaign.summary}
          </p>
        )}

        {/* RÔLE DU PORTEFEUILLE */}

        {isProject && (
          <div className="td-personal-tags">
            {campaign.isCreator && (
              <span>Créateur</span>
            )}

            {campaign.isBeneficiary && (
              <span>Bénéficiaire</span>
            )}
          </div>
        )}

        {/* OBJECTIF ET COLLECTE */}

        <div className="td-personal-metrics">
          <div>
            <span>Montant collecté</span>

            <strong>
              {displayNumber(
                campaign.totalRaisedETH,
                6
              )} ETH
            </strong>
          </div>

          <div>
            <span>Objectif</span>

            <strong>
              {displayNumber(
                campaign.goalETH,
                6
              )} ETH
            </strong>
          </div>
        </div>

        {/* BARRE DE PROGRESSION */}

        <div
          className="td-personal-progress"
          role="progressbar"
          aria-label={`Progression de ${campaign.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="td-project-progress-label">
          <span>
            {displayNumber(progress, 1)} %
            de l'objectif
          </span>

          {raised >= goal && goal > 0 && (
            <span className="td-project-goal-reached">
              <CheckCircle2 size={14} />
              Objectif atteint
            </span>
          )}
        </div>

        {/* CONTRIBUTION HISTORIQUE */}

        {isContribution && (
          <div className="td-personal-highlight">
            <HandCoins size={19} />

            <div>
              <span>
                Ma contribution historique
              </span>

              <strong>
                {displayNumber(
                  campaign.contributionETH,
                  6
                )} ETH
              </strong>
            </div>
          </div>
        )}

        {/* SOLDE ACTUEL CFD */}

        {isToken && (
          <div className="td-personal-highlight">
            <Coins size={19} />

            <div>
              <span>
                Mes jetons actuels
              </span>

              <strong>
                {displayNumber(
                  campaign.cfdBalance,
                  6
                )} CFD
              </strong>
            </div>
          </div>
        )}

        {/* ÉCHÉANCE ET NAVIGATION */}

        <div className="td-personal-card-bottom">
          <span>
            <CalendarDays size={15} />

            {formatDeadline(
              campaign.deadlineISO
            )}
          </span>

          <Link
            to={`/campagnes/${campaign.id}`}
          >
            Voir le projet
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {/* Actions du bénéficiaire */}

        {isProject && campaign.isBeneficiary && (
        <CampaignFinancialActions
            campaignId={campaign.id}
            mode="withdrawal"
        />
        )}

        {/* Actions du détenteur de CFD */}

        {isToken && (
        <CampaignFinancialActions
            campaignId={campaign.id}
            mode="refund"
        />
        )}
      </div>
    </article>
  );
}


function GovernanceCard({ proposal }) {
  return (
    <article className="td-personal-card">
      <div className="td-personal-card-top">
        <div>
          <span className="td-personal-eyebrow">
            PROPOSITION #{proposal.id}
          </span>

          <h3>{proposal.type}</h3>

          <p className="td-personal-subtitle">
            Campagne #{proposal.campaignId}
          </p>
        </div>

        <span className="td-personal-status">
          {proposal.state}
        </span>
      </div>

      <div className="td-personal-metrics">
        <div>
          <span>Voix Pour</span>
          <strong>
            {displayNumber(
              proposal.forVotes,
              2
            )} CFD
          </strong>
        </div>

        <div>
          <span>Voix Contre</span>
          <strong>
            {displayNumber(
              proposal.againstVotes,
              2
            )} CFD
          </strong>
        </div>
      </div>

      <div className="td-personal-card-bottom">
        <span>
          <Vote size={15} />

          {proposal.hasVoted
            ? "Vous avez voté"
            : proposal.canVote
              ? "Votre vote est attendu"
              : "Consultation"}
        </span>

        <Link to={proposal.url}>
          Voir la proposition
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </article>
  );
}

// ======================================================
// PAGE PRINCIPALE
// ======================================================

export default function DashboardPage() {
  const {
    account,
    chainId,
    connected,
    correctNetwork,
  } = useWallet();

  const {
    isAdmin,
    isSignataire,
    loading: rolesLoading,
  } = useRoles();

  const [balance, setBalance] = useState(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [balanceError, setBalanceError] =
    useState("");

  const [dataError, setDataError] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [copied, setCopied] = useState(false);

  // ----------------------------------------------------
  // Charger toutes les informations du portefeuille
  // ----------------------------------------------------

  useEffect(() => {
    let active = true;

    setBalance(null);
    setData(null);
    setLoading(true);
    setCopied(false);

    setBalanceError("");
    setDataError("");

    if (!account || !connected || !correctNetwork) {
      setLoading(false);

      return () => {
        active = false;
      };
    }

    async function load() {
      // Lecture du solde réel MetaMask.
      const balanceTask = async () => {
        const injected = getMetaMask();

        if (!injected) {
          throw new Error(
            "MetaMask est introuvable."
          );
        }

        const provider =
          new BrowserProvider(injected);

        const network =
          await provider.getNetwork();

        if (
          network.chainId !== BigInt(chainId)
        ) {
          throw new Error(
            "Le réseau du portefeuille a changé."
          );
        }

        const value =
          await provider.getBalance(account);

        return formatEther(value);
      };

      const results = await Promise.allSettled([
        balanceTask(),
        readPersonalDashboard(account),
      ]);

      if (!active) return;

      if (results[0].status === "fulfilled") {
        setBalance(results[0].value);
      } else {
        setBalanceError(
          results[0].reason?.message ||
          "Impossible de lire le solde ETH."
        );
      }

      if (results[1].status === "fulfilled") {
        setData(results[1].value);
      } else {
        setDataError(
          results[1].reason?.message ||
          "Impossible de charger vos activités."
        );
      }

      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [
    account,
    chainId,
    connected,
    correctNetwork,
    refreshKey,
  ]);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  async function copyAddress() {
    if (!account) return;

    try {
      await navigator.clipboard.writeText(
        account
      );

      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const networkLabel =
    String(chainId) === "31337"
      ? "Hardhat Local"
      : String(chainId) === "11155111"
        ? "Sepolia"
        : `Réseau ${chainId ?? "inconnu"}`;

  const campaigns = data?.campaigns;
  const governance = data?.governance;

  const myProjects =
    campaigns?.myProjects ?? [];

  const myContributions =
    campaigns?.myContributions ?? [];

  const myTokens =
    campaigns?.myTokens ?? [];

  const myVotes =
    governance?.voted ?? [];

  const availableVotes =
    governance?.availableVotes ?? [];

  return (
    <div className="td-page">

      {/* EN-TÊTE */}

      <section className="td-hero">
        <div>
          <div className="td-eyebrow">
            <LayoutDashboard size={16} />
            ESPACE PERSONNEL
          </div>

          <h1>
            Mon espace <span>TAAZUR</span>
          </h1>

          <p>
            Vos campagnes, contributions,
            jetons CFD et décisions blockchain,
            réunis au même endroit.
          </p>
        </div>

        <button
          type="button"
          className="td-refresh-btn"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Actualiser
        </button>
      </section>

      {/* PORTEFEUILLE */}

      <section className="td-wallet-panel">
        <div className="td-wallet-heading">
          <div className="td-wallet-heading-left">
            <div className="td-wallet-icon">
              <Wallet size={24} />
            </div>

            <div>
              <span className="td-small-label">
                PORTEFEUILLE CONNECTÉ
              </span>

              <h2>
                {shortAddress(account)}
              </h2>
            </div>
          </div>

          <span className="td-connected-badge">
            <CheckCircle2 size={15} />
            Connecté
          </span>
        </div>

        <div className="td-wallet-info">
          <div>
            <span className="td-small-label">
              ADRESSE ETHEREUM
            </span>

            <div className="td-address-row">
              <code title={account}>
                {account}
              </code>

              <button
                type="button"
                onClick={copyAddress}
                aria-label="Copier l'adresse"
                title="Copier l'adresse"
              >
                {copied
                  ? <CheckCircle2 size={17} />
                  : <Copy size={17} />}
              </button>
            </div>
          </div>

          <div className="td-network">
            <Network size={17} />
            {networkLabel}
          </div>
        </div>
      </section>

      {/* ERREURS */}

      {balanceError && (
        <div className="td-alert" role="alert">
          <AlertCircle size={17} />
          {balanceError}
        </div>
      )}

      {dataError && (
        <div className="td-alert" role="alert">
          <AlertCircle size={17} />
          {dataError}
        </div>
      )}

      {data?.errors?.map((message) => (
        <div
          className="td-alert"
          role="alert"
          key={message}
        >
          <AlertCircle size={17} />
          {message}
        </div>
      ))}

      {campaigns?.incomplete && (
        <div className="td-alert" role="status">
          <AlertCircle size={17} />
          L'historique des campagnes est partiel.
          Certaines campagnes n'ont pas été lues
          ou dépassent la limite de 100.
        </div>
      )}

      {governance?.incomplete && (
        <div className="td-alert" role="status">
          <AlertCircle size={17} />
          Certaines propositions n'ont pas
          pu être chargées.
        </div>
      )}

      {/* STATISTIQUES PERSONNELLES */}

      <section className="td-stats">
        <StatCard
          icon={Wallet}
          label="Solde du portefeuille"
          value={
            loading
              ? "Chargement..."
              : `${displayNumber(
                  balance,
                  6
                )} ETH`
          }
          detail="Solde sur le réseau connecté"
        />

        <StatCard
          icon={FolderKanban}
          label="Mes projets"
          value={
            loading
              ? "..."
              : campaigns
                ? String(myProjects.length)
                : "—"
          }
          detail="Créateur ou bénéficiaire"
        />

        <StatCard
          icon={HandCoins}
          label="ETH historiquement contribués"
          value={
            loading
              ? "..."
              : campaigns
                ? `${displayNumber(
                    campaigns.totals.historicalETH,
                    6
                  )} ETH`
                : "—"
          }
          detail="Tous projets analysés confondus"
        />
      </section>

      {loading && (
        <div
          className="td-personal-loading"
          role="status"
        >
          <RefreshCw size={19} />
          Chargement de vos données blockchain...
        </div>
      )}

      {/* MES PROJETS */}

      <section className="td-section">
        <SectionHeading
          icon={FolderKanban}
          title="Mes projets"
          description="Campagnes dont vous êtes créateur ou bénéficiaire."
          count={campaigns ? myProjects.length : undefined}
        />

        {!loading && campaigns && (
          myProjects.length ? (
            <div className="td-personal-grid">
              {myProjects.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  type="project"
                />
              ))}
            </div>
          ) : (
            <EmptySection
              icon={FolderKanban}
              title="Aucun projet pour le moment"
              description="Créez votre première campagne sur TAAZUR."
              to="/creer"
              action="Créer un projet"
            />
          )
        )}

        <Link
          to="/creer"
          className="td-personal-section-link"
        >
          <PlusCircle size={17} />
          Créer une nouvelle campagne
        </Link>
      </section>

      {/* MES CONTRIBUTIONS */}

      <section className="td-section">
        <SectionHeading
          icon={HandCoins}
          title="Mes contributions"
          description="Montants ETH que votre adresse a historiquement contribués."
          count={
            campaigns
              ? myContributions.length
              : undefined
          }
        />

        {!loading && campaigns && (
          myContributions.length ? (
            <div className="td-personal-grid">
              {myContributions.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  type="contribution"
                />
              ))}
            </div>
          ) : (
            <EmptySection
              icon={HandCoins}
              title="Aucune contribution"
              description="Découvrez les projets et soutenez une initiative."
              to="/campagnes"
              action="Explorer les campagnes"
            />
          )
        )}
      </section>

      {/* MES JETONS CFD */}

      <section className="td-section">
        <SectionHeading
          icon={Coins}
          title="Mes jetons CFD"
          description="Solde actuel de vos jetons, séparé par campagne."
          count={
            campaigns
              ? myTokens.length
              : undefined
          }
        />
        <Link
            to="/transferer-cfd"
            className="td-personal-section-link"
        >
            <Send size={17} />
            Transférer mes jetons CFD
        </Link>

        {!loading && campaigns && (
          myTokens.length ? (
            <div className="td-personal-grid">
              {myTokens.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  type="token"
                />
              ))}
            </div>
          ) : (
            <EmptySection
              icon={Coins}
              title="Aucun jeton CFD détecté"
              description="Les CFD sont attribués lors des contributions et peuvent être transférés."
              to="/campagnes"
              action="Découvrir les projets"
            />
          )
        )}
      </section>

      {/* GOUVERNANCE PERSONNELLE */}

      <section className="td-section">
        <SectionHeading
          icon={Vote}
          title="Ma gouvernance"
          description="Vos votes et propositions disponibles parmi les 20 dernières propositions."
        />

        {governance && availableVotes.length > 0 && (
          <div className="td-personal-vote-notice">
            <Vote size={19} />

            <span>
              Vous avez {availableVotes.length} proposition(s)
              sur lesquelles vous pouvez voter.
            </span>
          </div>
        )}

        {!loading && governance && (
          myVotes.length ? (
            <div className="td-personal-grid">
              {myVotes.map((proposal) => (
                <GovernanceCard
                  key={proposal.id}
                  proposal={proposal}
                />
              ))}
            </div>
          ) : (
            <EmptySection
              icon={Vote}
              title="Aucun vote historique trouvé"
              description="Vos votes enregistrés apparaîtront ici lorsqu'ils figurent parmi les propositions analysées."
              to="/gouvernance"
              action="Consulter la gouvernance"
            />
          )
        )}

        <Link
          to="/gouvernance"
          className="td-personal-section-link"
        >
          <Vote size={17} />
          Consulter toutes les propositions
        </Link>
      </section>

      {/* ACCÈS SPÉCIAUX */}

      {!rolesLoading &&
        (isAdmin || isSignataire) && (
          <section className="td-section">
            <SectionHeading
              icon={LockKeyhole}
              title="Mes accès privilégiés"
              description="Fonctionnalités autorisées par les smart contracts."
            />

            <div className="td-personal-specials">
              {isAdmin && (
                <Link
                  to="/admin"
                  className="td-personal-special-link"
                >
                  <ShieldCheck size={21} />
                  Administration
                  <ArrowUpRight size={17} />
                </Link>
              )}

              {isSignataire && (
                <Link
                  to="/multisig"
                  className="td-personal-special-link"
                >
                  <KeyRound size={21} />
                  Multisignature
                  <ArrowUpRight size={17} />
                </Link>
              )}
            </div>
          </section>
        )}

      {/* EXPLORATION */}

      <section className="td-discover">
        <div className="td-discover-icon">
          <Compass size={26} />
        </div>

        <div>
          <h2>
            De nouvelles idées à soutenir
          </h2>

          <p>
            Explorez les projets de la communauté
            ou lancez une campagne TAAZUR.
          </p>
        </div>

        <div className="td-discover-actions">
          <Link
            to="/campagnes"
            className="td-secondary-link"
          >
            Explorer
            <ExternalLink size={16} />
          </Link>

          <Link
            to="/creer"
            className="td-primary-link"
          >
            <PlusCircle size={17} />
            Créer un projet
          </Link>
        </div>
      </section>
    </div>
  );
}
