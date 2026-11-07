import { useWallet } from "../contexts/useWallet.js";

export default function WalletConnection() {
  const {
    account,
    connected,
    correctNetwork,
    available,
    busy,
    error,
    connect,
    switchNetwork,
  } = useWallet();

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(account);
    } catch {
      // L’adresse reste affichée et sélectionnable.
    }
  }

  return (
    <section className="wallet-panel">
      <div className="wallet-panel-heading">
        <div>
          <p className="tiwizi-overline">
            Mon compte
          </p>

          <h2>
            {connected
              ? "Votre portefeuille est connecté."
              : "Votre espace commence ici."}
          </h2>
        </div>

        {connected && (
          <span className="wallet-state">
            Connecté
          </span>
        )}
      </div>

      {!connected && (
        <>
          <p>
            Connectez votre portefeuille pour retrouver
            vos projets, vos contributions et vos CFD.
          </p>

          <button
            type="button"
            onClick={connect}
            disabled={busy || !available}
          >
            {busy
              ? "Connexion en cours…"
              : "Connecter mon portefeuille"}
          </button>
        </>
      )}

      {!available && (
        <p>
          MetaMask n’est pas détecté. Utilisez un navigateur
          où son extension est installée, puis actualisez
          cette page.
        </p>
      )}

      {connected && (
        <>
          <p className="wallet-address-label">
            Adresse de mon compte
          </p>

          <p className="wallet-address">
            {account}
          </p>

          <button
            type="button"
            className="wallet-copy-button"
            onClick={copyAddress}
          >
            Copier mon adresse
          </button>

          {!correctNetwork && (
            <div className="wallet-network-message">
              <p>
                Votre portefeuille utilise un autre réseau.
                Changez de réseau pour effectuer vos opérations.
              </p>

              <button
                type="button"
                onClick={switchNetwork}
                disabled={busy}
              >
                {busy
                  ? "Changement en cours…"
                  : "Utiliser le réseau de TAAZUR"}
              </button>
            </div>
          )}

          <p className="wallet-help">
            Pour utiliser une autre adresse, changez
            de compte dans MetaMask.
          </p>
        </>
      )}

      {error && (
        <p role="alert">
          {error}
        </p>
      )}
    </section>
  );
}