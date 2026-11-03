import { useEffect, useRef } from "react";

import {
  Link,
  NavLink,
  Outlet,
  useLocation,
} from "react-router";

export default function MainLayout() {
  const location = useLocation();

  const mainRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const titles = {
      "/": "Tiwizi - Ensemble, donnons vie aux projets",
      "/campagnes": "Les projets - Tiwizi",
      "/creer": "Créer mon projet - Tiwizi",
      "/contribuer": "Contribuer - Tiwizi",
      "/gouvernance": "Gouvernance - Tiwizi",
      "/admin": "Administration - Tiwizi",
      "/portefeuille": "Mon portefeuille - Tiwizi",
    };

    document.title =
      titles[location.pathname] ||
      "Page introuvable - Tiwizi";

    if (location.hash) {
      const frame = window.requestAnimationFrame(() => {
        document
          .getElementById(location.hash.slice(1))
          ?.scrollIntoView();
      });

      firstRender.current = false;

      return () => window.cancelAnimationFrame(frame);
    }

    window.scrollTo({
      top: 0,
      behavior: "instant",
    });

    if (!firstRender.current) {
      mainRef.current?.focus({
        preventScroll: true,
      });
    }

    firstRender.current = false;
  }, [location.pathname, location.hash]);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Aller au contenu
      </a>

      <header className="app-header">
        <div className="header-inner">
          <Link
            to="/"
            className="brand"
            aria-label="Tiwizi - Accueil"
          >
            <span className="tiwizi-brand-name">
              tiwizi

              <span
                className="tiwizi-brand-dot"
                aria-hidden="true"
              />
            </span>
          </Link>

          <nav
            className="main-nav"
            aria-label="Navigation principale"
            style={{ flexWrap: "wrap" }}
          >
            <NavLink to="/" end>
              Accueil
            </NavLink>

            <NavLink to="/campagnes">
              Les projets
            </NavLink>

            <NavLink to="/creer">
              Créer un projet
            </NavLink>

            <NavLink to="/gouvernance">
              Gouvernance
            </NavLink>

            <NavLink to="/admin">
              Administration
            </NavLink>

            <NavLink to="/portefeuille">
              Mon portefeuille
            </NavLink>
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        className="app-main"
        ref={mainRef}
        tabIndex={-1}
      >
        <Outlet />
      </main>

      <footer className="app-footer">
        <strong>Tiwizi</strong>

        <p>
          Ensemble, donnons vie aux projets.
        </p>

        <span>
          Des idées individuelles. Une force collective.
        </span>
      </footer>
    </>
  );
}