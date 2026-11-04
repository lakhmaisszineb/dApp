
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  formatEther,
  isAddress,
  parseEther,
} from "ethers";

import multiSigArtifact from "../contracts/MultiSig.json";
import deployment from "../contracts/deployment.json";

const RPC_URL = "http://127.0.0.1:8545";
const EXPECTED_CHAIN_ID = BigInt(deployment.chainId ?? 31337);

function contractAddress() {
  if (!isAddress(deployment.multiSig)) {
    throw new Error(
      "Adresse MultiSig absente ou invalide dans deployment.json."
    );
  }
  return deployment.multiSig;
}

function contractAbi() {
  const abi = multiSigArtifact.abi ?? multiSigArtifact;

  if (!Array.isArray(abi)) {
    throw new Error("ABI MultiSig invalide.");
  }

  return abi;
}

function getInjectedWallet() {
  const ethereum = window.ethereum;

  if (Array.isArray(ethereum?.providers)) {
    return ethereum.providers.find((p) => p.isMetaMask);
  }

  return ethereum?.isMetaMask ? ethereum : null;
}

export function explainMultiSigError(error) {
  const code = error?.code ?? error?.info?.error?.code;

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "Transaction refusée dans MetaMask.";
  }

  const message = String(
    error?.reason ||
      error?.revert?.args?.[0] ||
      error?.shortMessage ||
      error?.message ||
      "Erreur inconnue."
  );

  const translations = {
    "Not a signataire":
      "Ce portefeuille n'est pas l'un des trois signataires.",
    "Already confirmed":
      "Ce signataire a déjà confirmé cette transaction.",
    "Not enough confirmations":
      "Deux confirmations sont nécessaires pour exécuter.",
    "Transaction does not exist":
      "Cette transaction n'existe pas.",
    "Transaction already executed":
      "Cette transaction est déjà exécutée.",
    "Transaction failed":
      "L'appel final a échoué. Vérifie le destinataire, les données et le solde.",
    "To zero address":
      "Le destinataire ne peut pas être l'adresse zéro.",
    "insufficient funds":
      "Le compte MetaMask ne possède pas assez d'ETH pour le gas.",
  };

  for (const [key, value] of Object.entries(translations)) {
    if (message.includes(key)) return value;
  }

  return message;
}

async function getReadContract() {
  const provider = new JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Réseau RPC incorrect : ${network.chainId.toString()}.`
    );
  }

  const multiSig = new Contract(
    contractAddress(),
    contractAbi(),
    provider
  );

  const code = await provider.getCode(contractAddress());

  if (code === "0x") {
    throw new Error(
      "Aucun contrat MultiSig à cette adresse sur Hardhat Local."
    );
  }

  return { provider, multiSig };
}

async function getWriteContract() {
  const ethereum = getInjectedWallet();

  if (!ethereum) {
    throw new Error("MetaMask n'est pas disponible.");
  }

  const provider = new BrowserProvider(ethereum);
  const network = await provider.getNetwork();

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      "Sélectionne le réseau Hardhat Local dans MetaMask."
    );
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const multiSig = new Contract(
    contractAddress(),
    contractAbi(),
    signer
  );

  if (!(await multiSig.isSignataire(address))) {
    throw new Error("Not a signataire");
  }

  return { multiSig, signer, address };
}

export async function readMultiSigDashboard(
  account,
  limit = 30
) {
  const { provider, multiSig } = await getReadContract();

  const [countRaw, balanceRaw, addresses] = await Promise.all([
    multiSig.transactionCount(),
    provider.getBalance(contractAddress()),
    Promise.all(
      [0, 1, 2].map((index) => multiSig.signataires(index))
    ),
  ]);

  const totalCount = Number(countRaw);
  const signataires = addresses.map((address, index) => ({
    index: index + 1,
    address,
    isCurrent:
      !!account &&
      address.toLowerCase() === account.toLowerCase(),
  }));

  const isSignataire = account
    ? await multiSig.isSignataire(account)
    : false;

  const firstId = Math.max(1, totalCount - limit + 1);

  const ids = [];
  for (let id = totalCount; id >= firstId; id--) {
    ids.push(id);
  }

  const transactions = [];

  // Lecture par petits lots pour éviter un trop grand
  // nombre de requêtes simultanées.
  for (let start = 0; start < ids.length; start += 5) {
    const batch = ids.slice(start, start + 5);

    const results = await Promise.all(
      batch.map(async (id) => {
        const txn = await multiSig.getTransaction(id);

        const confirmations = await Promise.all(
          addresses.map(async (address) => ({
            address,
            confirmed: await multiSig.isConfirmed(
              id,
              address
            ),
          }))
        );

        const confirmationCount = Number(txn[4]);
        const executed = Boolean(txn[3]);

        return {
          id,
          to: txn[0],
          valueWei: txn[1].toString(),
          valueETH: formatEther(txn[1]),
          data: txn[2],
          executed,
          confirmationCount,
          confirmations,
          hasConfirmed: !!account && confirmations.some(
            (item) =>
              item.address.toLowerCase() ===
                account.toLowerCase() &&
              item.confirmed
          ),
          canConfirm: Boolean(isSignataire) && !executed &&
            !confirmations.some(
              (item) =>
                account &&
                item.address.toLowerCase() ===
                  account.toLowerCase() &&
                item.confirmed
            ),
          canExecute:
            Boolean(isSignataire) &&
            !executed &&
            confirmationCount >= 2,
        };
      })
    );

    transactions.push(...results);
  }

  return {
    address: contractAddress(),
    balanceETH: formatEther(balanceRaw),
    signataires,
    isSignataire: Boolean(isSignataire),
    transactionCount: totalCount,
    transactions,
  };
}

export async function submitMultiSigTransaction({
  to,
  valueETH,
  onSubmitted,
}) {
  if (!isAddress(to)) {
    throw new Error("Adresse de destination invalide.");
  }

  if (to.toLowerCase() ===
    "0x0000000000000000000000000000000000000000") {
    throw new Error("To zero address");
  }

  let amount;

  try {
    amount = parseEther(String(valueETH).trim());
  } catch {
    throw new Error("Montant ETH invalide.");
  }

  if (amount < 0n) {
    throw new Error("Le montant ne peut pas être négatif.");
  }

  // Interface volontairement limitée aux transferts ETH.
  // 0x signifie qu'aucune fonction de contrat n'est appelée.
  const data = "0x";

  const { multiSig } = await getWriteContract();

  const tx = await multiSig.submitTransaction(
    to,
    amount,
    data
  );

  onSubmitted?.(tx.hash);

  await tx.wait();

  return tx.hash;
}

export async function confirmMultiSigTransaction(
  txId,
  onSubmitted
) {
  const { multiSig } = await getWriteContract();

  const tx = await multiSig.confirmTransaction(txId);

  onSubmitted?.(tx.hash);

  await tx.wait();

  return tx.hash;
}

export async function executeMultiSigTransaction(
  txId,
  onSubmitted
) {
  const { multiSig } = await getWriteContract();

  const tx = await multiSig.executeTransaction(txId);

  onSubmitted?.(tx.hash);

  await tx.wait();

  return tx.hash;
}
