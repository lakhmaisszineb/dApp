import { useEffect, useState } from "react";
import { sendWithFeePreview } from "../services/transactionFees.js";

import { Link } from "react-router";

import { getProjectsPage } from "../services/projectDetails.js";

import "../styles/project-pages.css";

function ProjectCard({ project }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className="project-card">
      <Link
        to={`/campagnes/${project.id}`}
        className="project-card-visual"
        aria-label={`Découvrir ${project.title}`}
      >
        {project.imageURL && !imageFailed ? (
          <img
            src={project.imageURL}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="project-image-placeholder">
            <span>tiwizi</span>
            <p>Une idée à faire grandir.</p>
          </div>
        )}
      </Link>

      <div className="project-card-content">
        <div className="project-card-labels">
          <span className="project-category">
            {project.category || `Projet #${project.id}`}
          </span>

          {project.frozen && (
            <span className="project-frozen-label">
              Gelée
            </span>
          )}
        </div>

        <h2>
          <Link to={`/campagnes/${project.id}`}>
            {project.title}
          </Link>
        </h2>

        <p className="project-card-summary">
          {project.summary ||
            "Consultez le financement et les informations de cette campagne."}
        </p>

        <p className="project-status-label">
          {project.status}
        </p>

        <div className="project-card-financing">
          <strong>{project.raised} ETH</strong>

          <span>
            sur un objectif de {project.goal} ETH
          </span>
        </div>

        <progress
          max="100"
          value={project.progress}
          aria-label={`Progression du financement de ${project.title}`}
        />

        <p className="project-card-deadline">
          Échéance :{" "}
          {new Date(
            project.deadline * 1000
          ).toLocaleDateString("fr-FR")}
        </p>

        <Link
          to={`/campagnes/${project.id}`}
          className="button"
        >
          Découvrir le projet
        </Link>
      </div>
    </article>
  );
}

export default function CampaignsPage() {
  const [projects, setProjects] = useState([]);
  const [next, setNext] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getProjectsPage()
      .then((result) => {
        if (!active) return;

        setProjects(result.projects);
        setNext(result.next);
      })
      .catch((loadError) => {
        if (!active) return;

        setError(
          loadError.shortMessage ||
            loadError.message ||
            "Impossible de charger les projets."
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function loadPage(append = false) {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await getProjectsPage(
        append ? next : null
      );

      setProjects((previous) =>
        append
          ? [...previous, ...result.projects]
          : result.projects
      );

      setNext(result.next);
    } catch (loadError) {
      setError(
        loadError.shortMessage ||
          loadError.message ||
          "Impossible de charger les projets."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="projects-title">
      <header className="projects-page-heading">
        <div>
          <p className="tiwizi-overline">
            La force du collectif
          </p>

          <h1 id="projects-title">
            Des projets à faire grandir.
          </h1>

          <p>
            Découvrez leur histoire, leur objectif
            et les personnes qui les portent.
          </p>
        </div>

        <Link className="button" to="/creer">
          Créer mon projet
        </Link>
      </header>

      <div className="projects-toolbar">
        <p>
          Les campagnes les plus récentes
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={() => loadPage(false)}
        >
          Actualiser
        </button>
      </div>

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p role="status">
          Chargement des projets et de leurs présentations…
        </p>
      )}

      {!loading && !error && projects.length === 0 && (
        <article className="project-empty-state">
          <h2>
            La première idée peut être la vôtre.
          </h2>

          <p>
            Aucun projet n’a encore été publié
            sur cette plateforme.
          </p>

          <Link className="button" to="/creer">
            Présenter mon projet
          </Link>
        </article>
      )}

      <div
        className="projects-directory-grid"
        aria-busy={loading}
      >
        {projects.map((project) => (
          <ProjectCard
            key={`${project.id}-${project.imageURL}`}
            project={project}
          />
        ))}
      </div>

      {next && (
        <div className="projects-pagination">
          <button
            type="button"
            disabled={loading}
            onClick={() => loadPage(true)}
          >
            Voir les projets précédents
          </button>
        </div>
      )}
    </section>
  );
}