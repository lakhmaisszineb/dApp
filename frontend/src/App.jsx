
import { Route, Routes } from "react-router";

import { WalletProvider } from "./contexts/WalletContext.jsx";

import MainLayout from "./layouts/MainLayout.jsx";

// Pages de l'application ADWAL
import HomePage from "./pages/HomePage.jsx";
import CampaignsPage from "./pages/CampaignsPage.jsx";
import ProjectDetailsPage from "./pages/ProjectDetailsPage.jsx";
import CreateCampaignPage from "./pages/CreateCampaignPage.jsx";
import ContributionPage from "./pages/ContributionPage.jsx";
import GovernancePage from "./pages/GovernancePage.jsx";
import WalletPage from "./pages/WalletPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

import "./App.css";

export default function App() {
  return (
    <WalletProvider>
      <Routes>
        <Route element={<MainLayout />}>

          {/* Page d'accueil */}
          <Route
            index
            element={<HomePage />}
          />

          {/* Liste des campagnes */}
          <Route
            path="campagnes"
            element={<CampaignsPage />}
          />

          {/* Détails d'une campagne */}
          <Route
            path="campagnes/:id"
            element={<ProjectDetailsPage />}
          />

          {/* Création d'une campagne */}
          <Route
            path="creer"
            element={<CreateCampaignPage />}
          />

          {/* Contributions en ETH */}
          <Route
            path="contribuer"
            element={<ContributionPage />}
          />

          {/* Gouvernance et votes */}
          <Route
            path="gouvernance"
            element={<GovernancePage />}
          />

          {/* Portefeuille MetaMask */}
          <Route
            path="portefeuille"
            element={<WalletPage />}
          />

          {/* Administration ADWAL */}
          <Route
            path="admin"
            element={<AdminPage />}
          />

          {/* Page introuvable */}
          <Route
            path="*"
            element={<NotFoundPage />}
          />

        </Route>
      </Routes>
    </WalletProvider>
  );
}
