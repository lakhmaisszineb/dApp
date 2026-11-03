import { Link } from "react-router";

import TiwiziCompanion from "./TiwiziCompanion.jsx";

function ArrowIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TiwiziHome() {
  return (
    <>
      <section
        className="tiwizi-hero"
        aria-labelledby="home-title"
      >
        <div className="tiwizi-hero-copy">
          <p className="tiwizi-overline">
            Des idées individuelles. Une force collective.
          </p>

          <h1 id="home-title">
            Ensemble,
            <br />
            donnons vie
            <br />
            <span>aux projets.</span>
          </h1>

          <p className="tiwizi-hero-description">
            Tiwizi rapproche les personnes qui portent une
            idée et celles qui souhaitent la faire avancer.
            Découvrez les projets, soutenez ceux qui vous
            parlent et participez à leurs décisions.
          </p>

          <div className="tiwizi-hero-actions">
            <Link
              to="/campagnes"
              className="button"
            >
              Découvrir les projets
              <ArrowIcon />
            </Link>

            <Link
              to="/creer"
              className="button"
              style={{
                color: "var(--blue)",
                background: "var(--surface)",
                border: "1px solid var(--blue)",
              }}
            >
              Créer mon projet
              <ArrowIcon />
            </Link>
          </div>

          <p className="tiwizi-wallet-note">
            Explorez librement. Connectez votre portefeuille
            lorsque vous souhaitez créer, contribuer ou voter.
          </p>
        </div>

        <TiwiziCompanion />
      </section>

      <section
        id="choisir-parcours"
        className="tiwizi-section"
        aria-labelledby="path-title"
      >
        <div className="tiwizi-section-heading">
          <p className="tiwizi-overline">
            Deux façons de participer
          </p>

          <h2 id="path-title">
            Quelle sera votre prochaine aventure ?
          </h2>

          <p>
            Soutenez un projet ou donnez un premier élan
            au vôtre. Votre portefeuille vous accompagne
            dans les deux parcours.
          </p>
        </div>

        <div className="tiwizi-paths">
          <article className="tiwizi-path tiwizi-path-support">
            <span className="tiwizi-path-number">
              01 / Soutenir
            </span>

            <h3>
              Je donne un coup de pouce.
            </h3>

            <p>
              Découvrez les campagnes, comprenez leur
              objectif et contribuez à celles que vous
              souhaitez voir aboutir.
            </p>

            <Link
              to="/campagnes"
              className="tiwizi-path-link"
            >
              Explorer les projets
              <ArrowIcon />
            </Link>
          </article>

          <article className="tiwizi-path tiwizi-path-create">
            <span className="tiwizi-path-number">
              02 / Entreprendre
            </span>

            <h3>
              Je porte une idée.
            </h3>

            <p>
              Présentez votre projet, définissez son
              financement et rassemblez une communauté
              autour de sa réalisation.
            </p>

            <Link
              to="/creer"
              className="tiwizi-path-link"
            >
              Créer mon projet
              <ArrowIcon />
            </Link>
          </article>
        </div>
      </section>

      <section
        id="fonctionnement"
        className="tiwizi-section"
        aria-labelledby="how-title"
      >
        <div className="tiwizi-section-heading">
          <p className="tiwizi-overline">
            Du soutien aux décisions
          </p>

          <h2 id="how-title">
            Une aventure qui se construit ensemble.
          </h2>

          <p>
            Chaque campagne possède son financement,
            ses jetons CFD et sa communauté de votants.
          </p>
        </div>

        <ol className="tiwizi-steps">
          <li>
            <span className="tiwizi-step-index">
              01
            </span>

            <h3>
              Découvrez le projet
            </h3>

            <p>
              Consultez sa présentation, l’utilisation
              prévue des fonds, son objectif et son
              échéance avant de vous engager.
            </p>
          </li>

          <li>
            <span className="tiwizi-step-index">
              02
            </span>

            <h3>
              Apportez votre soutien
            </h3>

            <p>
              Contribuez en ETH depuis votre portefeuille.
              Vous recevez les CFD associés à la campagne,
              proportionnellement à votre contribution.
            </p>
          </li>

          <li>
            <span className="tiwizi-step-index">
              03
            </span>

            <h3>
              Participez aux décisions
            </h3>

            <p>
              Consultez les propositions et votez avec
              le pouvoir enregistré pour votre adresse
              au snapshot de chaque proposition.
            </p>
          </li>
        </ol>
      </section>

      <section
        id="preparer-projet"
        className="tiwizi-creator-intro"
        aria-labelledby="creator-title"
      >
        <div>
          <p className="tiwizi-overline">
            À vous de lancer le mouvement
          </p>

          <h2 id="creator-title">
            Votre idée mérite une présentation à sa hauteur.
          </h2>

          <p>
            Racontez ce que vous voulez accomplir,
            expliquez comment les fonds seront utilisés
            et définissez les conditions de votre campagne.
          </p>

          <Link
            to="/creer"
            className="button"
          >
            Commencer mon projet
            <ArrowIcon />
          </Link>
        </div>

        <ol>
          <li>
            Présentez votre idée avec une image
            et une description.
          </li>

          <li>
            Définissez l’objectif, la durée
            et le bénéficiaire.
          </li>

          <li>
            Relisez les informations avant publication.
          </li>

          <li>
            Confirmez la création avec votre portefeuille.
          </li>
        </ol>
      </section>
    </>
  );
}