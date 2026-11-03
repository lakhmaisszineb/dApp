import { Link } from "react-router";
import ContributionForm from "../components/ContributionForm.jsx";

export default function ContributionPage() {
  return (
    <>
      <header className="page-heading">
        <p className="tiwizi-overline">Le parcours contributeur</p>

        <h1>Soutenir un projet.</h1>

        <p>
          Consultez une campagne et confirmez votre contribution
          avec votre portefeuille.
        </p>

        <Link to="/portefeuille">
          Connecter ou vérifier mon portefeuille
        </Link>
      </header>

      <div className="feature-panel">
        <ContributionForm />
      </div>
    </>
  );
}