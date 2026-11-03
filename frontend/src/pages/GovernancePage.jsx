import { Link } from "react-router";
import GovernanceDashboard from "../components/GovernanceDashboard.jsx";

export default function GovernancePage() {
  return (
    <>
      <header className="page-heading">
        <p className="tiwizi-overline">Les décisions collectives</p>

        <h1>Prendre part à la suite.</h1>

        <p>
          Consultez les propositions et participez aux décisions
          des campagnes pour lesquelles vous disposez de droits
          de vote.
        </p>

        <Link to="/portefeuille">
          Connecter ou vérifier mon portefeuille
        </Link>
      </header>

      <div className="feature-panel">
        <GovernanceDashboard />
      </div>
    </>
  );
}