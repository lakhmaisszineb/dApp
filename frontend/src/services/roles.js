
import { isAddress } from "ethers";
import { getReadContracts } from "./contracts.js";

// =======================================================
// TIWIZI — Détection des rôles depuis la blockchain
//
// Important : les permissions sont déterminées par
// les smart contracts, pas par une liste d'adresses
// codée en dur dans React.
// =======================================================

function sameAddress(a, b) {
  return Boolean(a && b) &&
    String(a).toLowerCase() === String(b).toLowerCase();
}

function supports(contract, signature) {
  try {
    return Boolean(contract.interface.hasFunction(signature));
  } catch {
    return false;
  }
}

async function readAddressRole(contract, functionName, account) {
  if (!supports(contract, `${functionName}()`)) {
    return null;
  }

  const authorizedAddress = await contract[functionName]();

  return sameAddress(authorizedAddress, account);
}

async function readAccessControlRole(
  contract,
  roleGetter,
  account
) {
  if (
    !supports(contract, "hasRole(bytes32,address)") ||
    !supports(contract, `${roleGetter}()`)
  ) {
    return null;
  }

  const role = await contract[roleGetter]();

  return Boolean(await contract.hasRole(role, account));
}

async function detectAdmin(crowdfunding, account) {
  // Plusieurs structures courantes sont prises en charge :
  // Ownable, administrateur explicite ou AccessControl.
  // Seules les fonctions effectivement présentes dans
  // l'ABI de TIWIZI sont appelées.

  const checks = [
    () => readAddressRole(crowdfunding, "admin", account),
    () => readAddressRole(crowdfunding, "owner", account),
    () => readAccessControlRole(
      crowdfunding,
      "ADMIN_ROLE",
      account
    ),
    () => readAccessControlRole(
      crowdfunding,
      "DEFAULT_ADMIN_ROLE",
      account
    ),
  ];

  let supported = false;
  let hasError = false;

  for (const check of checks) {
    try {
      const result = await check();

      if (result === null) continue;

      supported = true;

      if (result) {
        return { authorized: true, verified: true };
      }
    } catch {
      hasError = true;
    }
  }

  return {
    authorized: false,
    verified: supported && !hasError,
  };
}

export async function readUserRoles(account) {
  if (!account || !isAddress(account)) {
    return {
      isAdmin: false,
      isSignataire: false,
      adminVerified: false,
      signataireVerified: false,
      errors: [],
    };
  }

  const { crowdfunding, multiSig } =
    await getReadContracts();

  const errors = [];

  const [adminResult, signerResult] =
    await Promise.allSettled([
      detectAdmin(crowdfunding, account),
      multiSig.isSignataire(account),
    ]);

  const admin =
    adminResult.status === "fulfilled"
      ? adminResult.value
      : { authorized: false, verified: false };

  const signataireVerified =
    signerResult.status === "fulfilled";

  if (!admin.verified) {
    errors.push(
      "Autorisation administrateur non vérifiée."
    );
  }

  if (!signataireVerified) {
    errors.push(
      "Autorisation multisignature non vérifiée."
    );
  }

  return {
    isAdmin: admin.authorized,
    isSignataire: signataireVerified
      ? Boolean(signerResult.value)
      : false,
    adminVerified: admin.verified,
    signataireVerified,
    errors,
  };
}
