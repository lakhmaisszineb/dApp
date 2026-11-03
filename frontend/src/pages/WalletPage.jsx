import { Link } from "react-router";

import WalletConnection from "../components/WalletConnection.jsx";
import PlatformStatus from "../components/PlatformStatus.jsx";

export default function WalletPage() {
  return (
    <>
      <header className="page-heading">
        <p className="tiwizi-overline">Votre accès à Tiwizi</p>

        <h1>Mon portefeuille.</h1>

        <p>
          Connectez le compte que vous souhaitez utiliser.
          Le même compte peut contribuer et créer des campagnes.
        </p>
      </header>

      <div className="overview-grid">
        <div className="feature-panel">
          <WalletConnection />
        </div>

        <div className="feature-panel">
          <PlatformStatus />
        </div>
      </div>

      <div className="wallet-next-actions">
        <Link to="/contribuer" className="button">
          Contribuer
        </Link>

        <Link
          to="/gouvernance"
          className="button button-secondary"
        >
          Consulter les propositions
        </Link>
      </div>
    </>
  );
}