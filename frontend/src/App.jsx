import { Route, Routes } from "react-router";

import { WalletProvider } from "./contexts/WalletContext.jsx";

import MainLayout from "./layouts/MainLayout.jsx";

import HomePage from "./pages/HomePage.jsx";
import CampaignsPage from "./pages/CampaignsPage.jsx";
import ProjectDetailsPage from "./pages/ProjectDetailsPage.jsx";
import CreateCampaignPage from "./pages/CreateCampaignPage.jsx";
import ContributionPage from "./pages/ContributionPage.jsx";
import GovernancePage from "./pages/GovernancePage.jsx";
import WalletPage from "./pages/WalletPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

import "./App.css";

export default function App() {
  return (
    <WalletProvider>
      <Routes>
        <Route element={<MainLayout />}>
          <Route
            index
            element={<HomePage />}
          />

          <Route
            path="campagnes"
            element={<CampaignsPage />}
          />

          <Route
            path="campagnes/:id"
            element={<ProjectDetailsPage />}
          />

          <Route
            path="creer"
            element={<CreateCampaignPage />}
          />

          <Route
            path="contribuer"
            element={<ContributionPage />}
          />

          <Route
            path="gouvernance"
            element={<GovernancePage />}
          />

          <Route
            path="portefeuille"
            element={<WalletPage />}
          />

          <Route
            path="*"
            element={<NotFoundPage />}
          />
        </Route>
      </Routes>
    </WalletProvider>
  );
}