
import { Route, Routes } from "react-router";
import TransferCFDPage from "./pages/TransferCFDPage.jsx";

import DashboardPage from "./pages/DashboardPage.jsx";

// ======================================================
// TIWIZI — CONTEXTES
// ======================================================

import { WalletProvider } from "./contexts/WalletContext.jsx";

// ======================================================
// TIWIZI — LAYOUT ET PROTECTION DES ROUTES
// ======================================================

import MainLayout from "./layouts/MainLayout.jsx";

import RequireWallet from "./components/RequireWallet.jsx";
import RequireRole from "./components/RequireRole.jsx";

// ======================================================
// TIWIZI — PAGES PUBLIQUES
// ======================================================

import HomePage from "./pages/HomePage.jsx";
import CampaignsPage from "./pages/CampaignsPage.jsx";
import ProjectDetailsPage from "./pages/ProjectDetailsPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

// ======================================================
// TIWIZI — CONNEXION METAMASK
// ======================================================

import ConnectWalletPage from "./pages/ConnectWalletPage.jsx";

// ======================================================
// TIWIZI — PAGES UTILISATEURS
// ======================================================

import CreateCampaignPage from "./pages/CreateCampaignPage.jsx";
import ContributionPage from "./pages/ContributionPage.jsx";
import GovernancePage from "./pages/GovernancePage.jsx";
import WalletPage from "./pages/WalletPage.jsx";

// ======================================================
// TIWIZI — PAGES PRIVILÉGIÉES
// ======================================================

import AdminPage from "./pages/AdminPage.jsx";
import MultiSigPage from "./pages/MultiSigPage.jsx";

// ======================================================
// STYLES
// ======================================================

import "./App.css";

// ======================================================
// APPLICATION PRINCIPALE
// ======================================================

export default function App() {
  return (
    <WalletProvider>
      <Routes>
        <Route element={<MainLayout />}>

          {/* ======================================== */}
          {/* PAGES PUBLIQUES                         */}
          {/* ======================================== */}

          <Route
            index
            element={<HomePage />}
          />


          <Route
            path="transferer-cfd"
            element={
              <RequireWallet>
                <TransferCFDPage />
              </RequireWallet>
            }
          />

          <Route
            path="campagnes"
            element={<CampaignsPage />}
          />

          <Route
            path="campagnes/:id"
            element={<ProjectDetailsPage />}
          />

          {/* ======================================== */}
          {/* CONNEXION METAMASK                      */}
          {/* ======================================== */}

          <Route
            path="connexion"
            element={<ConnectWalletPage />}
          />
          <Route
            path="mon-espace"
            element={
              <RequireWallet>
                <DashboardPage />
              </RequireWallet>
            }
          />

          {/* ======================================== */}
          {/* CRÉATION DE CAMPAGNE                    */}
          {/* ======================================== */}

          <Route
            path="creer"
            element={
              <RequireWallet>
                <CreateCampaignPage />
              </RequireWallet>
            }
          />

          {/* ======================================== */}
          {/* CONTRIBUTIONS ETH                       */}
          {/* ======================================== */}

          <Route
            path="contribuer"
            element={
              <RequireWallet>
                <ContributionPage />
              </RequireWallet>
            }
          />

          {/* ======================================== */}
          {/* GOUVERNANCE CFD                         */}
          {/* Consultation publique, vote soumis     */}
          {/* aux contrôles blockchain.              */}
          {/* ======================================== */}

          <Route
            path="gouvernance"
            element={<GovernancePage />}
          />

          {/* ======================================== */}
          {/* PORTEFEUILLE METAMASK                   */}
          {/* ======================================== */}

          <Route
            path="portefeuille"
            element={<WalletPage />}
          />

          {/* ======================================== */}
          {/* ADMINISTRATION                          */}
          {/* ======================================== */}

          <Route
            path="admin"
            element={
              <RequireRole role="admin">
                <AdminPage />
              </RequireRole>
            }
          />

          {/* ======================================== */}
          {/* MULTISIGNATURE 2/3                      */}
          {/* ======================================== */}

          <Route
            path="multisig"
            element={
              <RequireRole role="signataire">
                <MultiSigPage />
              </RequireRole>
            }
          />

          {/* ======================================== */}
          {/* PAGE INTROUVABLE                        */}
          {/* ======================================== */}

          <Route
            path="*"
            element={<NotFoundPage />}
          />

        </Route>
      </Routes>
    </WalletProvider>
  );
}
