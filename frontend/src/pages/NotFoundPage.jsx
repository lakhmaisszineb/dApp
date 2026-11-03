import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <section className="feature-panel">
      <p className="tiwizi-overline">Erreur 404</p>

      <h1>Cette page est introuvable.</h1>

      <p>
        Le lien est peut-être incorrect ou la page a été déplacée.
      </p>

      <Link to="/" className="button">
        Revenir à l’accueil
      </Link>
    </section>
  );
}