import { useEffect, useRef, useState } from "react";

import { Link, useParams } from "react-router";

import { formatUnits, parseEther } from "ethers";

import { useWallet } from "../contexts/useWallet.js";

import {
  contributeToCampaign,
  getReadContracts,
} from "../services/contracts.js";

import {
  getProjectDetails,
} from "../services/projectDetails.js";

import "../styles/project-pages.css";

function ContributionPanel({ project, onConfirmed }) {
  const {
    account,
    connected,
    correctNetwork,
    connect,
    switchNetwork,
    busy: walletBusy,
  } = useWallet();

  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [hash, setHash] = useState("");

  const submitting = useRef(false);

  useEffect(() => {
    let active = true;

    getReadContracts()
      .then(({ crowdfunding }) =>
        crowdfunding.CFD_RATE()
      )
      .then((value) => {
        if (active) {
          setRate(value);
        }
      })
      .catch(() => {
        // Le contrat reste responsable du calcul des CFD.
      });

    return () => {
      active = false;
    };
  }, []);

  let estimatedCFD = "";

  if (
    rate !== null &&
    /^\d+(\.\d{1,18})?$/.test(amount.trim())
  ) {
    const value = parseEther(amount.trim());

    if (value > 0n) {
      estimatedCFD = formatUnits(value * rate, 18);
    }
  }

  async function contribute(event) {
    event.preventDefault();

    if (submitting.current || hash) {
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError("");
    setMessage("Confirmez votre contribution dans MetaMask.");

    try {
      const result = await contributeToCampaign(
        project.id,
        amount,
        (transactionHash) => {
          setHash(transactionHash);

          setMessage(
            "Contribution envoyée. Confirmation en cours…"
          );
        }
      );

      setMessage(
        result.cfdBalance !== null
          ? `Contribution confirmée. Votre solde est de ${result.cfdBalance} CFD pour cette campagne.`
          : "Votre contribution est confirmée."
      );

      setAmount("");

      // Une erreur d’actualisation ne doit pas masquer le succès.
      onConfirmed();
    } catch (contributionError) {
      setError(
        contributionError.code === "ACTION_REJECTED"
          ? "Vous avez annulé la confirmation."
          : contributionError.reason ||
            contributionError.shortMessage ||
            contributionError.message ||
            "La contribution n’a pas abouti."
      );

      setMessage("");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <aside className="project-funding-panel">
      <p className="tiwizi-overline">
        Le financement
      </p>

      <span className="project-status-label">
        {project.status}
      </span>

      <h2>{project.raised} ETH</h2>

      <p>
        collectés sur un objectif de {project.goal} ETH
      </p>

      <progress
        max="100"
        value={project.progress}
        aria-label="Progression du financement"
      />

      <dl className="project-funding-facts">
        <div>
          <dt>Fin de la collecte</dt>

          <dd>
            {new Date(
              project.deadline * 1000
            ).toLocaleString("fr-FR")}
          </dd>
        </div>

        <div>
          <dt>État de la campagne</dt>

          <dd>
            {project.frozen
              ? "Gelée par la gouvernance"
              : project.paid
                ? "Fonds retirés"
                : "Fonds non retirés"}
          </dd>
        </div>
      </dl>

      {!project.canContribute ? (
        <p className="project-information-note">
          {project.paused
            ? "Les contributions sont momentanément suspendues sur la plateforme."
            : project.frozen
              ? "Cette campagne est gelée et ne reçoit pas de contributions."
              : "Cette campagne ne reçoit plus de contributions."}
        </p>
      ) : !connected ? (
        <div>
          <p>
            Connectez votre portefeuille pour soutenir
            ce projet.
          </p>

          <button
            type="button"
            onClick={connect}
            disabled={walletBusy}
          >
            Connecter mon portefeuille
          </button>
        </div>
      ) : !correctNetwork ? (
        <div>
          <p>
            Changez de réseau pour contribuer à ce projet.
          </p>

          <button
            type="button"
            onClick={switchNetwork}
            disabled={walletBusy}
          >
            Utiliser le réseau de Taazur
          </button>
        </div>
      ) : (
        <form onSubmit={contribute}>
          <label htmlFor={`contribution-${project.id}`}>
            Ma contribution en ETH
          </label>

          <input
            id={`contribution-${project.id}`}
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value)
            }
            inputMode="decimal"
            placeholder="Exemple : 0.1"
            required
            disabled={busy || Boolean(hash)}
          />

          {estimatedCFD && (
            <p>
              Vous recevrez {estimatedCFD} CFD
              de cette campagne.
            </p>
          )}

          <p>
            Les frais réseau s’ajoutent au montant
            de votre contribution.
          </p>

          <button
            type="submit"
            disabled={busy || Boolean(hash)}
          >
            {busy
              ? "Confirmation en cours…"
              : hash
                ? "Transaction envoyée"
                : "Soutenir ce projet"}
          </button>

          <p className="project-connected-address">
            Compte utilisé : {account}
          </p>
        </form>
      )}

      {message && (
        <p role="status">
          {message}
        </p>
      )}

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {hash && (
        <div className="project-transaction-reference">
          <p>Transaction : {hash}</p>

          <p>
            Consultez son état dans l’activité de MetaMask.
            Ne renvoyez pas la même contribution si sa
            confirmation est encore incertaine.
          </p>
        </div>
      )}
    </aside>
  );
}

export default function ProjectDetailsPage() {
  const { id } = useParams();

  const { account, chainId } = useWallet();

  const [result, setResult] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    getProjectDetails(id)
      .then((project) => {
        if (!active) return;

        setResult({
          id,
          refreshKey,
          project,
          error: "",
        });
      })
      .catch((loadError) => {
        if (!active) return;

        setResult({
          id,
          refreshKey,
          project: null,

          error:
            loadError.shortMessage ||
            loadError.message ||
            "Impossible de charger ce projet.",
        });
      });

    return () => {
      active = false;
    };
  }, [id, refreshKey]);

  const current =
    result?.id === id &&
    result?.refreshKey === refreshKey
      ? result
      : null;

  const project = current?.project;

  function refresh() {
    setRefreshKey((previous) => previous + 1);
  }

  return (
    <section className="project-details-page">
      <Link
        className="project-back-link"
        to="/campagnes"
      >
        Retour aux projets
      </Link>

      {!current && (
        <p role="status">
          Chargement du projet…
        </p>
      )}

      {current?.error && (
        <>
          <p role="alert">
            {current.error}
          </p>

          <button type="button" onClick={refresh}>
            Réessayer
          </button>
        </>
      )}

      {project && (
        <>
          <header className="project-detail-heading">
            <p className="tiwizi-overline">
              {project.category || "Un projet Tiwizi"}
            </p>

            <h1>{project.title}</h1>

            {project.summary && (
              <p>{project.summary}</p>
            )}
          </header>

          <div className="project-details-grid">
            <div className="project-story">
              {project.imageURL && (
                <img
                  className="project-cover-image"
                  src={project.imageURL}
                  alt={`Présentation de ${project.title}`}
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.style.display =
                      "none";
                  }}
                />
              )}

              <article className="project-story-section">
                <h2>L’histoire du projet</h2>

                {project.description ? (
                  <p className="project-long-text">
                    {project.description}
                  </p>
                ) : (
                  <p>
                    La description n’est pas disponible.
                    Les informations financières restent
                    consultables.
                  </p>
                )}

                {!project.presentationAvailable && (
                  <p className="project-information-note">
                    La présentation IPFS est indisponible
                    ou sa référence n’est pas reconnue.
                  </p>
                )}
              </article>

              {project.fundsUsage.length > 0 && (
                <article className="project-story-section">
                  <h2>À quoi serviront les fonds ?</h2>

                  {project.fundsUsage.map(
                    (item, index) => (
                      <div
                        className="project-usage-item"
                        key={index}
                      >
                        <h3>
                          {item.label ||
                            `Utilisation ${index + 1}`}
                        </h3>

                        <p className="project-long-text">
                          {item.description}
                        </p>
                      </div>
                    )
                  )}
                </article>
              )}

              <article className="project-story-section">
                <h2>Les décisions du projet</h2>

                <p>
                  Les détenteurs de CFD participent
                  aux décisions selon leurs voix
                  enregistrées au snapshot.
                </p>

                <Link to="/gouvernance" className="button">
                  Accéder à la gouvernance
                </Link>

                <p className="project-small-note">
                  Campagne #{project.id}
                </p>
              </article>

              <article className="project-story-section">
                <h2>Informations et transparence</h2>

                <dl className="project-transparency">
                  <div>
                    <dt>Créateur</dt>
                    <dd>{project.creator}</dd>
                  </div>

                  <div>
                    <dt>Bénéficiaire</dt>
                    <dd>{project.beneficiary}</dd>
                  </div>

                  <div>
                    <dt>Contrat du token CFD</dt>
                    <dd>{project.token}</dd>
                  </div>

                  <div>
                    <dt>Fonds disponibles dans la campagne</dt>
                    <dd>{project.available} ETH</dd>
                  </div>
                </dl>

                {project.metadataURL && (
                  <a
                    href={project.metadataURL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Consulter la présentation sur IPFS
                  </a>
                )}

                <p className="project-small-note">
                  La présentation est fournie par le créateur.
                  Les montants et le statut sont lus dans
                  le contrat.
                </p>
              </article>
            </div>

            <ContributionPanel
              key={`${project.id}-${account}-${chainId}`}
              project={project}
              onConfirmed={refresh}
            />
          </div>
        </>
      )}
    </section>
  );
}