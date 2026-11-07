
import {
  Navigate,
  Link,
  useLocation,
} from "react-router";

import {
  ShieldAlert,
  ArrowLeft,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";

import { useWallet } from "../contexts/useWallet.js";
import { useRoles } from "../contexts/useRoles.js";

// ======================================================
// TIWIZI — PROTECTION DES PAGES PRIVILÉGIÉES
//
// role = "admin" ou "signataire"
//
// Cette protection améliore l'expérience utilisateur.
// Les permissions définitives sont vérifiées
// par les smart contracts.
// ======================================================

export default function RequireRole({
  role,
  children,
}) {
  const location = useLocation();

  const {
    connected,
    correctNetwork,
  } = useWallet();

  const {
    isAdmin,
    isSignataire,
    adminVerified,
    signataireVerified,
    loading,
  } = useRoles();

  if (!connected || !correctNetwork) {
    return (
      <Navigate
        to="/connexion"
        replace
        state={{
          from:
            location.pathname +
            location.search +
            location.hash,
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="tr-access-page">
        <LoaderCircle size={34} />

        <h2>Vérification des autorisations</h2>

        <p>
          TAAZUR vérifie vos permissions
          sur la blockchain.
        </p>
      </div>
    );
  }

  const isAuthorized =
    role === "admin"
      ? isAdmin
      : role === "signataire"
        ? isSignataire
        : false;

  const verified =
    role === "admin"
      ? adminVerified
      : role === "signataire"
        ? signataireVerified
        : false;

  if (!verified) {
    return (
      <div
        className="tr-access-page"
        style={{
          maxWidth: 600,
          padding: "80px 24px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <ShieldAlert
          size={45}
          color="#b7791f"
        />

        <h2>
          Autorisations indisponibles
        </h2>

        <p>
          Impossible de vérifier votre rôle
          sur le réseau blockchain actuel.
          Vérifiez la connexion Hardhat
          et réessayez.
        </p>

        <Link to="/">
          <ArrowLeft size={17} />
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div
        className="tr-access-page"
        style={{
          maxWidth: 600,
          padding: "80px 24px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <LockKeyhole
          size={45}
          color="#4776a8"
        />

        <h2>Accès non autorisé</h2>

        <p>
          Ce portefeuille ne possède pas
          les permissions nécessaires
          pour accéder à cette page.
        </p>

        <Link to="/">
          <ArrowLeft size={17} />
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  return children;
}
