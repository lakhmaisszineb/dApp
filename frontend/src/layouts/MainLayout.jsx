
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Link,
  NavLink,
  Outlet,
  useLocation,
} from "react-router";

import {
  House,
  Compass,
  PlusCircle,
  Vote,
  Wallet,
  ShieldCheck,
  KeyRound,
  ChevronDown,
  CircleUserRound,
  LogIn,
  Menu,
  X,
  LayoutDashboard,
  Coins,
} from "lucide-react";

import { useWallet } from "../contexts/useWallet.js";
import { useRoles } from "../contexts/useRoles.js";

// Cloche de notifications originale de TIWIZI
import NotificationBell from "../components/NotificationBell.jsx";

import "./MainLayout.css";

// ============================================================
// TIWIZI — MAIN LAYOUT
//
// Navigation principale
// Menu personnel MetaMask
// Tableau de bord
// Gouvernance
// Administration
// Multisignature
// Cloche de notifications existante
//
// La nouvelle cloche WithdrawalAlerts est temporairement
// désactivée pour isoler le problème d'affichage.
// ============================================================

const PAGE_TITLES = {
  "/": "Accueil — TIWIZI",
  "/campagnes": "Explorer les projets — TIWIZI",
  "/creer": "Créer mon projet — TIWIZI",
  "/contribuer": "Contribuer — TIWIZI",
  "/connexion": "Connexion MetaMask — TIWIZI",
  "/gouvernance": "Gouvernance — TIWIZI",
  "/portefeuille": "Mon portefeuille — TIWIZI",
  "/mon-espace": "Mon espace — TIWIZI",
  "/transferer-cfd": "Transférer mes CFD — TIWIZI",
  "/admin": "Administration — TIWIZI",
  "/multisig": "Multisignature — TIWIZI",
};

// ============================================================
// LIEN DE NAVIGATION
// ============================================================

function NavigationItem({
  to,
  icon: Icon,
  children,
  end = false,
  onClick,
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        [
          "tl-nav-link",
          isActive ? "tl-nav-active" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      <Icon
        size={17}
        strokeWidth={1.9}
        aria-hidden="true"
      />

      <span>{children}</span>
    </NavLink>
  );
}

// ============================================================
// MAIN LAYOUT
// ============================================================

export default function MainLayout() {
  const location = useLocation();

  const mainRef = useRef(null);
  const accountMenuRef = useRef(null);
  const firstRenderRef = useRef(true);

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  // ----------------------------------------------------------
  // Portefeuille MetaMask
  // ----------------------------------------------------------

  const {
    account,
    connected,
    correctNetwork,
  } = useWallet();

  // ----------------------------------------------------------
  // Autorisations utilisateur
  // ----------------------------------------------------------

  const {
    isAdmin,
    isSignataire,
    loading: rolesLoading,
  } = useRoles();

  const walletReady =
    Boolean(connected && correctNetwork);

  const shortAccount = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : null;

  // ----------------------------------------------------------
  // Changement de page
  // ----------------------------------------------------------

  useEffect(() => {
    document.title =
      PAGE_TITLES[location.pathname] ||
      (
        location.pathname.startsWith("/campagnes/")
          ? "Détails du projet — TIWIZI"
          : "TIWIZI"
      );

    setMobileMenuOpen(false);

    if (accountMenuRef.current) {
      accountMenuRef.current.open = false;
    }

    if (location.hash) {
      const frame = window.requestAnimationFrame(() => {
        const targetId =
          decodeURIComponent(
            location.hash.substring(1)
          );

        document
          .getElementById(targetId)
          ?.scrollIntoView({
            behavior: "smooth",
          });
      });

      firstRenderRef.current = false;

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    window.scrollTo({
      top: 0,
      behavior: "auto",
    });

    if (!firstRenderRef.current) {
      mainRef.current?.focus({
        preventScroll: true,
      });
    }

    firstRenderRef.current = false;
  }, [
    location.pathname,
    location.hash,
  ]);

  // ----------------------------------------------------------
  // Fermer le menu au clic extérieur et avec Échap
  // ----------------------------------------------------------

  useEffect(() => {
    function handleOutside(event) {
      const menu = accountMenuRef.current;

      if (
        menu?.open &&
        !menu.contains(event.target)
      ) {
        menu.open = false;
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        if (accountMenuRef.current) {
          accountMenuRef.current.open = false;
        }

        setMobileMenuOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      handleOutside
    );

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutside
      );

      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, []);

  // ==========================================================
  // INTERFACE
  // ==========================================================

  return (
    <>
      {/* ACCESSIBILITÉ */}

      <a
        href="#main-content"
        className="skip-link"
      >
        Aller au contenu principal
      </a>

      {/* ==================================================== */}
      {/* HEADER                                               */}
      {/* ==================================================== */}

      <header className="app-header tl-header">
        <div className="header-inner tl-header-inner">

          {/* LOGO */}

          <Link
            to="/"
            className="brand tl-brand"
            aria-label="TIWIZI — Accueil"
          >
            <span className="tiwizi-brand-name">
              tiwizi

              <span
                className="tiwizi-brand-dot"
                aria-hidden="true"
              />
            </span>
          </Link>

          {/* NAVIGATION PRINCIPALE */}

          <nav
            className={[
              "main-nav",
              "tl-nav",
              mobileMenuOpen
                ? "tl-nav-mobile-open"
                : "",
            ]
              .filter(Boolean)
              .join(" ")
            }
            aria-label="Navigation principale"
          >
            <NavigationItem
              to="/"
              icon={House}
              end
              onClick={() =>
                setMobileMenuOpen(false)
              }
            >
              Accueil
            </NavigationItem>

            <NavigationItem
              to="/campagnes"
              icon={Compass}
              onClick={() =>
                setMobileMenuOpen(false)
              }
            >
              Explorer
            </NavigationItem>

            <NavigationItem
              to="/creer"
              icon={PlusCircle}
              onClick={() =>
                setMobileMenuOpen(false)
              }
            >
              Créer un projet
            </NavigationItem>

            <NavigationItem
              to="/gouvernance"
              icon={Vote}
              onClick={() =>
                setMobileMenuOpen(false)
              }
            >
              Gouvernance
            </NavigationItem>
          </nav>

          {/* ================================================= */}
          {/* ACTIONS DE NAVIGATION                             */}
          {/* ================================================= */}

          <div className="tl-header-actions">

            {/* Cloche originale :
                notifications gouvernance et multisig */}

            <NotificationBell />
            {/* La nouvelle cloche WithdrawalAlerts
                n'est pas montée pour le moment.
                Nous l'intégrerons plus tard dans
                NotificationBell sans la dupliquer. */}

            {/* ============================================== */}
            {/* MENU PERSONNEL                                  */}
            {/* ============================================== */}

            <details
              className="tl-account-menu"
              ref={accountMenuRef}
            >
              <summary className="tl-account-trigger">
                <CircleUserRound
                  size={20}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />

                <span className="tl-account-name">
                  {connected
                    ? shortAccount || "Mon compte"
                    : "Se connecter"}
                </span>

                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </summary>

              <div className="tl-account-panel">

                {/* EN-TÊTE DU MENU */}

                <div className="tl-account-heading">
                  <strong>
                    {connected
                      ? "Mon espace TIWIZI"
                      : "Bienvenue sur TIWIZI"}
                  </strong>

                  <span>
                    {connected
                      ? shortAccount
                      : "Portefeuille non connecté"}
                  </span>
                </div>

                {/* UTILISATEUR NON CONNECTÉ */}

                {!connected && (
                  <Link
                    to="/connexion"
                    className="tl-menu-link"
                  >
                    <LogIn size={17} />

                    <span>
                      Se connecter avec MetaMask
                    </span>
                  </Link>
                )}

                {/* TABLEAU DE BORD PERSONNEL */}

                {connected && (
                  <Link
                    to="/mon-espace"
                    className="tl-menu-link"
                  >
                    <LayoutDashboard size={17} />

                    <span>Mon espace</span>
                  </Link>
                )}

                {/* PORTEFEUILLE */}

                <Link
                  to="/portefeuille"
                  className="tl-menu-link"
                >
                  <Wallet size={17} />

                  <span>Mon portefeuille</span>
                </Link>

                {/* TRANSFERT DE JETONS CFD */}

                {walletReady && (
                  <Link
                    to="/transferer-cfd"
                    className="tl-menu-link"
                  >
                    <CoinsIcon />

                    <span>
                      Transférer mes CFD
                    </span>
                  </Link>
                )}

                {/* ADMINISTRATION */}

                {walletReady && isAdmin && (
                  <Link
                    to="/admin"
                    className="tl-menu-link"
                  >
                    <ShieldCheck size={17} />

                    <span>Administration</span>
                  </Link>
                )}

                {/* MULTISIGNATURE */}

                {walletReady && isSignataire && (
                  <Link
                    to="/multisig"
                    className="tl-menu-link"
                  >
                    <KeyRound size={17} />

                    <span>Multisignature</span>
                  </Link>
                )}

                {/* CHARGEMENT DES RÔLES */}

                {walletReady && rolesLoading && (
                  <p className="tl-menu-hint">
                    Vérification des rôles...
                  </p>
                )}

                {/* MAUVAIS RÉSEAU */}

                {connected && !correctNetwork && (
                  <Link
                    to="/connexion"
                    className="tl-menu-link"
                  >
                    <LogIn size={17} />

                    <span>Changer de réseau</span>
                  </Link>
                )}

              </div>
            </details>

            {/* MENU MOBILE */}

            <button
              type="button"
              className="tl-mobile-toggle"
              aria-label={
                mobileMenuOpen
                  ? "Fermer le menu"
                  : "Ouvrir le menu"
              }
              aria-expanded={mobileMenuOpen}
              onClick={() =>
                setMobileMenuOpen((previous) => !previous)
              }
            >
              {mobileMenuOpen
                ? <X size={22} />
                : <Menu size={22} />
              }
            </button>

          </div>
        </div>
      </header>

      {/* ==================================================== */}
      {/* CONTENU DES PAGES                                   */}
      {/* ==================================================== */}

      <main
        id="main-content"
        className="app-main"
        ref={mainRef}
        tabIndex={-1}
      >
        <Outlet />
      </main>

      {/* ==================================================== */}
      {/* FOOTER                                               */}
      {/* ==================================================== */}

      <footer className="app-footer">
        <strong>TIWIZI</strong>

        <p>
          Ensemble, donnons vie aux projets.
        </p>

        <span>
          Des idées individuelles.
          Une force collective.
        </span>
      </footer>
    </>
  );
}

// ============================================================
// Petite icône SVG via Lucide
// ============================================================

function CoinsIcon() {
  return (
    <Coins size={17} strokeWidth={1.8} />
  );
}
