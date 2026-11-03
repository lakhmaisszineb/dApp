import { useEffect, useState } from "react";

import { BrowserProvider, formatEther } from "ethers";

import { WalletContext } from "./useWallet.js";

import deployment from "../contracts/deployment.json";

const EXPECTED_CHAIN_ID = BigInt(deployment.chainId);

function findWallet() {
  const ethereum = window.ethereum;

  if (Array.isArray(ethereum?.providers)) {
    return (
      ethereum.providers.find(
        (provider) => provider.isMetaMask
      ) ?? null
    );
  }

  return ethereum?.isMetaMask ? ethereum : null;
}

function explainError(error) {
  const code =
    error?.code ??
    error?.info?.error?.code ??
    error?.data?.originalError?.code;

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "Vous avez annulé la demande dans votre portefeuille.";
  }

  if (code === -32002) {
    return "Une demande est déjà ouverte dans MetaMask.";
  }

  return (
    error?.shortMessage ||
    error?.message ||
    "Impossible de contacter le portefeuille. Réessayez."
  );
}

export function WalletProvider({ children }) {
  const [wallet] = useState(findWallet);

  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connected = Boolean(account);

  const correctNetwork =
    chainId !== null &&
    chainId === EXPECTED_CHAIN_ID;

  /*
   * Restaurer les autorisations existantes et écouter
   * les changements de compte ou de réseau.
   */
  useEffect(() => {
    if (!wallet) return;

    let active = true;
    let revision = 0;

    async function refresh() {
      const currentRevision = ++revision;

      try {
        const [accounts, network] = await Promise.all([
          wallet.request({
            method: "eth_accounts",
          }),

          wallet.request({
            method: "eth_chainId",
          }),
        ]);

        if (!active || currentRevision !== revision) {
          return;
        }

        setAccount(accounts[0] || "");
        setChainId(BigInt(network));
        setError("");
      } catch {
        if (!active || currentRevision !== revision) {
          return;
        }

        setAccount("");
        setChainId(null);

        setError(
          "La connexion au portefeuille est interrompue."
        );
      }
    }

    function handleAccountsChanged(accounts) {
      revision += 1;

      setAccount(accounts[0] || "");
      setError("");

      void refresh();
    }

    function handleChainChanged(network) {
      revision += 1;

      setChainId(BigInt(network));
      setError("");

      void refresh();
    }

    function handleDisconnect() {
      revision += 1;

      setAccount("");
      setChainId(null);

      setError(
        "La connexion au portefeuille est interrompue."
      );
    }

    wallet.on("accountsChanged", handleAccountsChanged);
    wallet.on("chainChanged", handleChainChanged);
    wallet.on("disconnect", handleDisconnect);

    void refresh();

    return () => {
      active = false;
      revision += 1;

      wallet.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );

      wallet.removeListener(
        "chainChanged",
        handleChainChanged
      );

      wallet.removeListener(
        "disconnect",
        handleDisconnect
      );
    };
  }, [wallet]);

  async function connect() {
    if (!wallet) {
      setError(
        "Ouvrez Tiwizi dans un navigateur disposant de MetaMask."
      );

      return;
    }

    setBusy(true);
    setError("");

    try {
      await wallet.request({
        method: "eth_requestAccounts",
      });

      const [accounts, network] = await Promise.all([
        wallet.request({
          method: "eth_accounts",
        }),

        wallet.request({
          method: "eth_chainId",
        }),
      ]);

      setAccount(accounts[0] || "");
      setChainId(BigInt(network));
    } catch (connectionError) {
      setError(explainError(connectionError));
    } finally {
      setBusy(false);
    }
  }

  async function switchNetwork() {
    if (!wallet) {
      setError("MetaMask n’est pas disponible.");
      return;
    }

    setBusy(true);
    setError("");

    const networkHex =
      `0x${EXPECTED_CHAIN_ID.toString(16)}`;

    try {
      try {
        await wallet.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: networkHex }],
        });
      } catch (switchError) {
        const code =
          switchError?.code ??
          switchError?.data?.originalError?.code;

        if (code !== 4902) {
          throw switchError;
        }

        const rpcUrl =
          import.meta.env.VITE_RPC_URL?.trim() ||
          (
            EXPECTED_CHAIN_ID === 31337n
              ? "http://127.0.0.1:8545"
              : ""
          );

        if (!rpcUrl) {
          throw new Error(
            "L’adresse RPC du réseau doit être configurée.",
            { cause: switchError }
          );
        }

        await wallet.request({
          method: "wallet_addEthereumChain",

          params: [
            {
              chainId: networkHex,

              chainName:
                EXPECTED_CHAIN_ID === 11155111n
                  ? "Sepolia"
                  : "Réseau Tiwizi",

              nativeCurrency: {
                name: "Ether",
                symbol: "ETH",
                decimals: 18,
              },

              rpcUrls: [rpcUrl],
            },
          ],
        });

        await wallet.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: networkHex }],
        });
      }

      const network = await wallet.request({
        method: "eth_chainId",
      });

      setChainId(BigInt(network));
    } catch (switchError) {
      setError(explainError(switchError));
    } finally {
      setBusy(false);
    }
  }

  /*
   * Vérifier le compte et le réseau au moment de l’action.
   * Le signer n’est pas conservé entre les opérations.
   */
  async function getSigner() {
    if (!wallet) {
      throw new Error("MetaMask n’est pas disponible.");
    }

    const [accounts, network] = await Promise.all([
      wallet.request({
        method: "eth_accounts",
      }),

      wallet.request({
        method: "eth_chainId",
      }),
    ]);

    if (!accounts.length) {
      throw new Error(
        "Connectez votre portefeuille pour continuer."
      );
    }

    if (BigInt(network) !== EXPECTED_CHAIN_ID) {
      throw new Error(
        "Sélectionnez le réseau utilisé par Tiwizi."
      );
    }

    const provider = new BrowserProvider(wallet);

    return provider.getSigner(accounts[0]);
  }

  async function getBalance() {
    const signer = await getSigner();
    const address = await signer.getAddress();

    const balance =
      await signer.provider.getBalance(address);

    return formatEther(balance);
  }

  return (
    <WalletContext.Provider
      value={{
        account,
        chainId,
        connected,
        correctNetwork,

        available: Boolean(wallet),

        busy,
        error,

        connect,
        switchNetwork,
        getSigner,
        getBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}