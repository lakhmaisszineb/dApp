import { useEffect, useState } from "react";
import { BrowserProvider } from "ethers";

const EXPECTED_CHAIN_ID = BigInt(
  import.meta.env.VITE_CHAIN_ID || "31337"
);

const RPC_URL =
  import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";

// Pour cette première intégration : extension MetaMask du navigateur.
function getWallet() {
  const ethereum = window.ethereum;

  // Certaines extensions exposent plusieurs fournisseurs.
  if (Array.isArray(ethereum?.providers)) {
    return ethereum.providers.find((provider) => provider.isMetaMask);
  }

  return ethereum?.isMetaMask ? ethereum : undefined;
}

function explainError(error) {
  const code = error.code ?? error.info?.error?.code;

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "La demande a été refusée dans MetaMask.";
  }

  if (code === -32002) {
    return "Une demande est déjà en attente. Ouvre MetaMask.";
  }

  return "Impossible de contacter le portefeuille. Vérifie MetaMask et le réseau local.";
}

export default function WalletConnection() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const walletAvailable = Boolean(getWallet());

  const correctNetwork =
    chainId !== null && chainId === EXPECTED_CHAIN_ID;

  useEffect(() => {
    const wallet = getWallet();

    if (!wallet) {
      return;
    }

    let active = true;
    let revision = 0;

    // Lire les autorisations existantes sans ouvrir de demande.
    async function restoreConnection() {
      const initialRevision = revision;

      try {
        const [accounts, currentChain] = await Promise.all([
          wallet.request({ method: "eth_accounts" }),
          wallet.request({ method: "eth_chainId" }),
        ]);

        if (!active || revision !== initialRevision) {
          return;
        }

        setAccount(accounts[0] || "");
        setChainId(BigInt(currentChain));
      } catch {
        if (active && revision === initialRevision) {
          setError("Impossible de lire l’état de MetaMask.");
        }
      }
    }

    function handleAccountsChanged(accounts) {
      revision += 1;
      setAccount(accounts[0] || "");
      setError("");
    }

    function handleChainChanged(newChainId) {
      revision += 1;
      setChainId(BigInt(newChainId));
      setError("");
    }

    function handleDisconnect() {
      revision += 1;
      setAccount("");
      setChainId(null);
      setError("La connexion au réseau du portefeuille est interrompue.");
    }

    wallet.on("accountsChanged", handleAccountsChanged);
    wallet.on("chainChanged", handleChainChanged);
    wallet.on("disconnect", handleDisconnect);

    void restoreConnection();

    // Retirer les écouteurs lorsque le composant est démonté.
    return () => {
      active = false;

      wallet.removeListener("accountsChanged", handleAccountsChanged);
      wallet.removeListener("chainChanged", handleChainChanged);
      wallet.removeListener("disconnect", handleDisconnect);
    };
  }, []);

  async function connectWallet() {
    const wallet = getWallet();

    if (!wallet) {
      setError("Installe ou active MetaMask dans ce navigateur.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // Ouvre la demande de connexion après le clic de l’utilisateur.
      const accounts = await wallet.request({
        method: "eth_requestAccounts",
      });

      if (!accounts.length) {
        setAccount("");
        return;
      }

      // Ethers utilise le fournisseur de MetaMask.
      const provider = new BrowserProvider(wallet);
      const signer = await provider.getSigner(accounts[0]);
      const address = await signer.getAddress();

      const currentChain = await wallet.request({
        method: "eth_chainId",
      });

      setAccount(address);
      setChainId(BigInt(currentChain));
    } catch (connectionError) {
      setError(explainError(connectionError));
    } finally {
      setBusy(false);
    }
  }

  async function switchNetwork() {
    const wallet = getWallet();

    if (!wallet) {
      return;
    }

    setBusy(true);
    setError("");

    const chainIdHex = `0x${EXPECTED_CHAIN_ID.toString(16)}`;

    try {
      try {
        await wallet.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError) {
        const code =
          switchError.code ?? switchError.data?.originalError?.code;

        if (code !== 4902) {
          throw switchError;
        }

        // Le réseau n’est pas encore enregistré dans MetaMask.
        await wallet.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: "Hardhat Local",
              nativeCurrency: {
                name: "Ether",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: [RPC_URL],
            },
          ],
        });

        await wallet.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      }

      const currentChain = await wallet.request({
        method: "eth_chainId",
      });

      setChainId(BigInt(currentChain));
    } catch (switchError) {
      setError(explainError(switchError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Mon portefeuille</h2>

      {!walletAvailable && (
        <p>
          MetaMask n’est pas détecté. Ouvre ce site dans le navigateur
          où son extension est installée.
        </p>
      )}

      {!account ? (
        <button
          onClick={connectWallet}
          disabled={busy || !walletAvailable}
        >
          {busy ? "Connexion…" : "Connecter MetaMask"}
        </button>
      ) : (
        <>
          <p>
            <strong>Compte :</strong>{" "}
            <span style={{ overflowWrap: "anywhere" }}>{account}</span>
          </p>

          <p>
            <strong>Identifiant du réseau :</strong>{" "}
            {chainId === null ? "Indisponible" : chainId.toString()}
          </p>

          {correctNetwork ? (
            <p>✅ Réseau Hardhat sélectionné.</p>
          ) : (
            <>
              <p>Choisis le réseau Hardhat pour utiliser l’application.</p>

              <button onClick={switchNetwork} disabled={busy}>
                {busy ? "Changement…" : "Passer sur Hardhat"}
              </button>
            </>
          )}
        </>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}