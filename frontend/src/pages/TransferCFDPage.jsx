
import { useEffect, useState } from "react";
import {
  Contract,
  ZeroAddress,
  isAddress,
  formatUnits,
  parseUnits,
} from "ethers";

import { Link } from "react-router";

import {
  Send,
  Coins,
  Wallet,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  getReadContracts,
  getWriteContracts,
} from "../services/contracts.js";

import { useWallet } from "../contexts/useWallet.js";

import tokenArtifact from "../contracts/CFDToken.json";

import "./TransferCFDPage.css";

// ============================================================
// TIWIZI — TRANSFERT DE JETONS CFD ERC-20
// ============================================================

export default function TransferCFDPage() {
  const {
    account,
    connected,
    correctNetwork,
  } = useWallet();

  const [campaignId, setCampaignId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const [tokenInfo, setTokenInfo] = useState(null);

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Effacer l'état lors d'un changement de compte.
  useEffect(() => {
    setTokenInfo(null);
    setError("");
    setSuccess("");
  }, [account]);

  // ----------------------------------------------------------
  // Lire les CFD d'une campagne
  // ----------------------------------------------------------

  async function loadToken() {
    setError("");
    setSuccess("");
    setTokenInfo(null);

    if (!/^[1-9]\d*$/.test(campaignId.trim())) {
      setError("Indiquez un identifiant de campagne valide.");
      return;
    }

    if (!account || !connected || !correctNetwork) {
      setError("Connectez MetaMask au réseau TIWIZI.");
      return;
    }

    setLoading(true);

    try {
      const { crowdfunding } =
        await getReadContracts();

      const id = BigInt(campaignId);

      const count =
        await crowdfunding.campaignCount();

      if (id > count) {
        throw new Error(
          "Cette campagne n'existe pas."
        );
      }

      const campaign =
        await crowdfunding.campaigns(id);

      const token = new Contract(
        campaign.token,
        tokenArtifact.abi,
        crowdfunding.runner
      );

      const [
        name,
        symbol,
        decimals,
        balance,
      ] = await Promise.all([
        token.name(),
        token.symbol(),
        token.decimals(),
        token.balanceOf(account),
      ]);

      setTokenInfo({
        campaignId: id.toString(),
        address: campaign.token,
        name,
        symbol,
        decimals: Number(decimals),
        balanceRaw: balance,
        balance: formatUnits(
          balance,
          Number(decimals)
        ),
      });
    } catch (err) {
      setError(
        err?.shortMessage ||
        err?.message ||
        "Impossible de lire les CFD."
      );
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------------
  // Exécuter le transfert
  // ----------------------------------------------------------

  async function transferCFD(event) {
    event.preventDefault();

    if (!tokenInfo || sending) return;

    setError("");
    setSuccess("");

    try {
      if (
        !isAddress(recipient) ||
        recipient.toLowerCase() ===
          ZeroAddress.toLowerCase()
      ) {
        throw new Error(
          "L'adresse du destinataire est invalide."
        );
      }

      if (
        recipient.toLowerCase() ===
        account.toLowerCase()
      ) {
        throw new Error(
          "Vous ne pouvez pas transférer des CFD à votre propre adresse."
        );
      }

      const normalizedAmount = amount.trim();

      if (!/^\d+(\.\d+)?$/.test(normalizedAmount)) {
        throw new Error(
          "Indiquez un montant positif valide."
        );
      }

      const quantity = parseUnits(
        normalizedAmount,
        tokenInfo.decimals
      );

      if (quantity <= 0n) {
        throw new Error(
          "Le montant doit être supérieur à zéro."
        );
      }

      if (quantity > tokenInfo.balanceRaw) {
        throw new Error(
          "Votre solde CFD est insuffisant."
        );
      }

      const confirmed = window.confirm(
        `Transférer ${normalizedAmount} ` +
        `${tokenInfo.symbol} à ${recipient} ?\n\n` +
        "Les droits associés à ces CFD seront " +
        "transmis au destinataire. " +
        "Cette transaction blockchain est irréversible."
      );

      if (!confirmed) return;

      setSending(true);

      const {
        signer,
        crowdfunding,
      } = await getWriteContracts();

      const signerAddress =
        await signer.getAddress();

      if (
        signerAddress.toLowerCase() !==
        account.toLowerCase()
      ) {
        throw new Error(
          "Le compte MetaMask a changé. Actualisez."
        );
      }

      // Revérifier l'adresse du jeton de campagne.
      const campaign =
        await crowdfunding.campaigns(
          BigInt(tokenInfo.campaignId)
        );

      if (
        campaign.token.toLowerCase() !==
        tokenInfo.address.toLowerCase()
      ) {
        throw new Error(
          "Le jeton de la campagne a changé."
        );
      }

      const token = new Contract(
        tokenInfo.address,
        tokenArtifact.abi,
        signer
      );

      const currentBalance =
        await token.balanceOf(account);

      if (quantity > currentBalance) {
        throw new Error(
          "Solde insuffisant au moment du transfert."
        );
      }

      const tx = await token.transfer(
        recipient,
        quantity
      );

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error(
          "La transaction n'a pas été confirmée."
        );
      }

      const newBalance =
        await token.balanceOf(account);

      setTokenInfo((previous) => ({
        ...previous,
        balanceRaw: newBalance,
        balance: formatUnits(
          newBalance,
          previous.decimals
        ),
      }));

      setAmount("");

      setSuccess(
        `Transfert confirmé. Transaction : ${receipt.hash}`
      );
    } catch (err) {
      setError(
        err?.shortMessage ||
        err?.reason ||
        err?.message ||
        "Le transfert a échoué."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="tcfd-page">
      <Link to="/mon-espace" className="tcfd-back">
        <ArrowLeft size={17} />
        Retour à mon espace
      </Link>

      <div className="tcfd-heading">
        <span className="tcfd-eyebrow">
          <Coins size={17} />
          JETONS DE GOUVERNANCE
        </span>

        <h1>Transférer mes CFD</h1>

        <p>
          Transférez les jetons d'une campagne
          vers une autre adresse Ethereum.
        </p>
      </div>

      <div className="tcfd-card">
        <div className="tcfd-account">
          <Wallet size={20} />

          <div>
            <span>Portefeuille connecté</span>
            <strong>{account || "—"}</strong>
          </div>
        </div>

        <label htmlFor="tcfd-campaign">
          Identifiant de la campagne
        </label>

        <div className="tcfd-inline">
          <input
            id="tcfd-campaign"
            type="text"
            inputMode="numeric"
            placeholder="Exemple : 1"
            value={campaignId}
            disabled={sending}
            onChange={(event) => {
              setCampaignId(event.target.value);
              setTokenInfo(null);
              setSuccess("");
            }}
          />

          <button
            type="button"
            onClick={loadToken}
            disabled={loading || sending}
          >
            <RefreshCw size={16} />
            {loading ? "Lecture..." : "Consulter"}
          </button>
        </div>

        {tokenInfo && (
          <form onSubmit={transferCFD}>
            <div className="tcfd-balance">
              <Coins size={26} />

              <div>
                <span>Solde disponible</span>

                <strong>
                  {tokenInfo.balance}{" "}
                  {tokenInfo.symbol}
                </strong>

                <small>{tokenInfo.name}</small>
              </div>
            </div>

            <label htmlFor="tcfd-recipient">
              Adresse Ethereum du destinataire
            </label>

            <input
              id="tcfd-recipient"
              type="text"
              placeholder="0x..."
              value={recipient}
              disabled={sending}
              required
              onChange={(event) =>
                setRecipient(event.target.value)
              }
            />

            <label htmlFor="tcfd-amount">
              Quantité de CFD
            </label>

            <input
              id="tcfd-amount"
              type="text"
              inputMode="decimal"
              placeholder="Exemple : 100"
              value={amount}
              disabled={sending}
              required
              onChange={(event) =>
                setAmount(event.target.value)
              }
            />

            <div className="tcfd-warning">
              <ShieldCheck size={19} />

              <p>
                Vérifiez soigneusement l'adresse
                du destinataire. Le transfert est
                irréversible et peut transférer
                les droits de vote et de remboursement
                associés aux CFD.
              </p>
            </div>

            <button
              className="tcfd-submit"
              type="submit"
              disabled={
                sending ||
                tokenInfo.balanceRaw <= 0n
              }
            >
              <Send size={17} />
              {sending
                ? "Confirmation blockchain..."
                : "Transférer les CFD"}
            </button>
          </form>
        )}

        {error && (
          <div className="tcfd-error" role="alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}

        {success && (
          <div className="tcfd-success" role="status">
            <CheckCircle2 size={17} />
            {success}
          </div>
        )}
      </div>
    </div>
  );
}
