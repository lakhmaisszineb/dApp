
import {
  Navigate,
  useLocation,
} from "react-router";

import { useWallet } from "../contexts/useWallet.js";

// ======================================================
// TIWIZI — Protection des pages nécessitant MetaMask
//
// Ce composant vérifie la connexion et le réseau.
// Il ne remplace pas les permissions des contrats.
// ======================================================

export default function RequireWallet({ children }) {
  const location = useLocation();

  const {
    connected,
    correctNetwork,
  } = useWallet();

  if (!connected || !correctNetwork) {
    const from =
      location.pathname +
      location.search +
      location.hash;

    return (
      <Navigate
        to="/connexion"
        replace
        state={{ from }}
      />
    );
  }

  return children;
}
