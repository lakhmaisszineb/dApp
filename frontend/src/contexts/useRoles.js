
import { useEffect, useState } from "react";
import { useWallet } from "./useWallet.js";
import { readUserRoles } from "../services/roles.js";

const EMPTY_ROLES = {
  isAdmin: false,
  isSignataire: false,
  adminVerified: false,
  signataireVerified: false,
  errors: [],
};

export function useRoles() {
  const {
    account,
    connected,
    correctNetwork,
    chainId,
  } = useWallet();

  const [roles, setRoles] = useState(EMPTY_ROLES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    setRoles(EMPTY_ROLES);

    if (!connected || !correctNetwork || !account) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);

    async function loadRoles() {
      try {
        const result = await readUserRoles(account);

        if (active) {
          setRoles(result);
        }
      } catch {
        if (active) {
          setRoles({
            ...EMPTY_ROLES,
            errors: [
              "Impossible de lire les rôles blockchain.",
            ],
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadRoles();

    return () => {
      active = false;
    };
  }, [account, chainId, connected, correctNetwork]);

  return {
    ...roles,
    loading,
    connected,
    correctNetwork,
    account,
  };
}
