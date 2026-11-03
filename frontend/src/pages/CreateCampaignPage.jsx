import { useRef, useState } from "react";
import { Link } from "react-router";

import {
  Contract,
  ZeroAddress,
  getAddress,
  isAddress,
  parseEther,
} from "ethers";

import { useWallet } from "../contexts/useWallet.js";

import WalletConnection from "../components/WalletConnection.jsx";

import { getReadContracts } from "../services/contracts.js";

import {
  uploadCampaignMetadata,
} from "../services/campaignMetadata.js";

import deployment from "../contracts/deployment.json";

import crowdfundingArtifact from "../contracts/Crowdfunding.json";

const INITIAL_FORM = {
  title: "",
  summary: "",
  description: "",
  category: "Éducation",
  fundsUsage: "",
  goal: "",
  duration: "30",
  beneficiary: "",
};

const CATEGORIES = [
  "Éducation",
  "Solidarité",
  "Culture",
  "Environnement",
  "Entrepreneuriat",
  "Autre",
];

function validateForm(form, image) {
  for (const name of [
    "title",
    "summary",
    "description",
    "fundsUsage",
  ]) {
    if (!form[name].trim()) {
      throw new Error(
        "Complétez tous les champs de présentation."
      );
    }
  }

  if (!image) {
    throw new Error("Choisissez une image.");
  }

  if (image.size > 5 * 1024 * 1024) {
    throw new Error("L’image ne doit pas dépasser 5 Mo.");
  }

  if (!/^\d+(\.\d{1,18})?$/.test(form.goal.trim())) {
    throw new Error(
      "L’objectif doit être un montant en ETH avec au maximum 18 décimales."
    );
  }

  const goal = parseEther(form.goal.trim());

  if (goal <= 0n) {
    throw new Error("L’objectif doit être supérieur à zéro.");
  }

  const days = Number(form.duration);

  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 90
  ) {
    throw new Error(
      "La durée doit être un nombre entier entre 1 et 90 jours."
    );
  }

  const beneficiary = form.beneficiary.trim();

  if (
    !isAddress(beneficiary) ||
    getAddress(beneficiary) === ZeroAddress
  ) {
    throw new Error(
      "L’adresse du bénéficiaire est invalide."
    );
  }

  return {
    goal,
    duration: days * 24 * 60 * 60,
    beneficiary: getAddress(beneficiary),
  };
}

function explainError(error) {
  const code =
    error?.code ??
    error?.info?.error?.code;

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "Vous avez annulé la confirmation dans votre portefeuille.";
  }

  return (
    error?.reason ||
    error?.shortMessage ||
    error?.message ||
    "L’opération n’a pas abouti."
  );
}

export default function CreateCampaignPage() {
  const {
    account,
    connected,
    correctNetwork,
    getSigner,
  } = useWallet();

  const [form, setForm] = useState(INITIAL_FORM);
  const [image, setImage] = useState(null);

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [metadataURI, setMetadataURI] = useState("");
  const [transactionHash, setTransactionHash] = useState("");

  const [published, setPublished] = useState(false);
  const [campaignId, setCampaignId] = useState("");

  /*
   * Conserver le résultat IPFS si l’utilisateur refuse ensuite
   * la transaction, pour éviter de renvoyer les mêmes fichiers.
   */
  const uploadedMetadata = useRef(null);

  // Bloquer immédiatement les doubles clics.
  const actionInProgress = useRef(false);

  const locked =
    busy ||
    Boolean(transactionHash) ||
    published;

  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    uploadedMetadata.current = null;
    setMetadataURI("");
    setError("");
  }

  function selectImage(event) {
    const file = event.target.files?.[0] || null;

    uploadedMetadata.current = null;
    setMetadataURI("");
    setError("");

    if (file && file.size > 5 * 1024 * 1024) {
      setImage(null);
      event.target.value = "";

      setError("L’image ne doit pas dépasser 5 Mo.");
      return;
    }

    setImage(file);
  }

  function review(event) {
    event.preventDefault();
    setError("");

    try {
      validateForm(form, image);
      setStep(2);
    } catch (validationError) {
      setError(explainError(validationError));
    }
  }

  /*
   * Une confirmation blockchain est définitive, même si
   * l’extraction de l’identifiant depuis les événements échoue.
   */
  function finishPublication(receipt) {
    if (receipt.status !== 1) {
      setTransactionHash("");
      setError(
        "La transaction a été exécutée sans créer la campagne. Vous pouvez réessayer."
      );
      setMessage("");
      return;
    }

    const contractInterface =
      new Contract(
        deployment.crowdfunding,
        crowdfundingArtifact.abi
      ).interface;

    let createdId = "";

    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() !==
        deployment.crowdfunding.toLowerCase()
      ) {
        continue;
      }

      try {
        const event = contractInterface.parseLog(log);

        if (event?.name === "CampaignCreated") {
          createdId = event.args.campaignId.toString();
          break;
        }
      } catch {
        // Les autres événements ne concernent pas cette lecture.
      }
    }

    setCampaignId(createdId);
    setPublished(true);
    setError("");

    setMessage("Votre campagne a été publiée.");
  }

  async function publish() {
    if (
      actionInProgress.current ||
      transactionHash ||
      published
    ) {
      return;
    }

    actionInProgress.current = true;
    setBusy(true);
    setError("");

    try {
      const values = validateForm(form, image);

      const signer = await getSigner();
      const creator = await signer.getAddress();

      const contract = new Contract(
        deployment.crowdfunding,
        crowdfundingArtifact.abi,
        signer
      );

      /*
       * Vérifier les principales conditions avant de publier
       * des fichiers sur IPFS.
       */
      const [paused, minimum, maximum] = await Promise.all([
        contract.paused(),
        contract.MIN_DURATION(),
        contract.MAX_DURATION(),
      ]);

      if (paused) {
        throw new Error(
          "La création des campagnes est momentanément suspendue."
        );
      }

      if (
        BigInt(values.duration) < minimum ||
        BigInt(values.duration) > maximum
      ) {
        throw new Error(
          "La durée ne respecte pas les limites de la plateforme."
        );
      }

      let upload = uploadedMetadata.current;

      if (!upload) {
        setMessage(
          "Publication de l’image et de la présentation…"
        );

        upload = await uploadCampaignMetadata(form, image);

        uploadedMetadata.current = upload;
        setMetadataURI(upload.metadataURI);
      }

      /*
       * Vérifier de nouveau le compte après l’envoi IPFS :
       * il peut avoir changé pendant l’attente.
       */
      const currentSigner = await getSigner();
      const currentAccount =
        await currentSigner.getAddress();

      if (
        currentAccount.toLowerCase() !==
        creator.toLowerCase()
      ) {
        throw new Error(
          "Le compte a changé pendant la publication. Vérifiez le compte sélectionné avant de continuer."
        );
      }

      const currentContract = new Contract(
        deployment.crowdfunding,
        crowdfundingArtifact.abi,
        currentSigner
      );

      setMessage(
        "La présentation est prête. Confirmez la création dans votre portefeuille."
      );

      const transaction =
        await currentContract.createCampaign(
          values.goal,
          values.duration,
          values.beneficiary,
          upload.metadataURI
        );

      setTransactionHash(transaction.hash);

      setMessage(
        "Transaction envoyée. Confirmation de la création en cours…"
      );

      try {
        const receipt = await transaction.wait();

        if (receipt) {
          finishPublication(receipt);
        }
      } catch (confirmationError) {
        /*
         * Gérer une transaction accélérée ou remplacée
         * depuis le portefeuille.
         */
        if (
          confirmationError.code ===
          "TRANSACTION_REPLACED"
        ) {
          if (confirmationError.cancelled) {
            setTransactionHash("");
            setMessage("");

            setError(
              "La transaction a été annulée ou remplacée par une autre opération."
            );
          } else if (confirmationError.receipt) {
            setTransactionHash(
              confirmationError.receipt.hash
            );

            finishPublication(
              confirmationError.receipt
            );
          }
        } else {
          setError(
            "La confirmation n’a pas pu être lue. Vérifiez la transaction avant de recommencer."
          );
        }
      }
    } catch (publicationError) {
      setError(explainError(publicationError));
      setMessage("");
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  }

  async function checkTransaction() {
    if (!transactionHash || actionInProgress.current) {
      return;
    }

    actionInProgress.current = true;
    setBusy(true);
    setError("");

    try {
      const { crowdfunding } = await getReadContracts();

      const receipt =
        await crowdfunding.runner.getTransactionReceipt(
          transactionHash
        );

      if (!receipt) {
        setMessage(
          "La transaction n’est pas encore confirmée. Attendez puis vérifiez à nouveau. Si vous l’avez remplacée dans MetaMask, consultez son activité."
        );

        return;
      }

      finishPublication(receipt);
    } catch (receiptError) {
      setError(explainError(receiptError));
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className="create-campaign-page"
      aria-labelledby="create-campaign-title"
    >
      <header className="create-campaign-heading">
        <p className="tiwizi-overline">
          Espace créateur
        </p>

        <h1 id="create-campaign-title">
          Donnez un point de départ à votre idée.
        </h1>

        <p>
          Présentez votre projet, définissez son
          financement et invitez une communauté
          à le faire grandir.
        </p>
      </header>

      <WalletConnection />

      {published ? (
        <article className="publication-success">
          <p className="tiwizi-overline">
            Publication confirmée
          </p>

          <h2>Votre projet rejoint Tiwizi.</h2>

          {campaignId && (
            <p>
              Votre campagne porte le numéro{" "}
              <strong>#{campaignId}</strong>.
            </p>
          )}

          <p>
            Elle est maintenant enregistrée sur la
            blockchain et peut recevoir des contributions
            selon ses conditions.
          </p>

          <Link className="button" to="/campagnes">
            Voir les campagnes
          </Link>
        </article>
      ) : (
        <>
          <ol
            className="creation-steps"
            aria-label="Étapes de création"
          >
            <li
              aria-current={
                step === 1 ? "step" : undefined
              }
            >
              <span>01</span>
              Présenter mon projet
            </li>

            <li
              aria-current={
                step === 2 ? "step" : undefined
              }
            >
              <span>02</span>
              Vérifier et publier
            </li>
          </ol>

          {step === 1 ? (
            <form onSubmit={review}>
              <fieldset disabled={locked}>
                <legend>
                  La présentation
                </legend>

                <label htmlFor="project-title">
                  Nom du projet
                </label>

                <input
                  id="project-title"
                  name="title"
                  value={form.title}
                  onChange={updateField}
                  maxLength={120}
                  placeholder="Un nom clair pour votre projet"
                  required
                />

                <label htmlFor="project-summary">
                  Résumé
                </label>

                <textarea
                  id="project-summary"
                  name="summary"
                  value={form.summary}
                  onChange={updateField}
                  maxLength={300}
                  placeholder="Présentez votre idée en quelques phrases."
                  required
                />

                <label htmlFor="project-description">
                  Description du projet
                </label>

                <textarea
                  id="project-description"
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  maxLength={10000}
                  placeholder="Quel besoin souhaitez-vous résoudre ? Qui en bénéficiera ? Comment allez-vous réaliser le projet ?"
                  required
                />

                <label htmlFor="project-category">
                  Catégorie
                </label>

                <select
                  id="project-category"
                  name="category"
                  value={form.category}
                  onChange={updateField}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <label htmlFor="project-image">
                  Image de présentation
                </label>

                <input
                  id="project-image"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={selectImage}
                  required={!image}
                  aria-describedby="image-help"
                />

                <p id="image-help">
                  JPEG ou PNG, 5 Mo maximum.
                  {image && ` Fichier choisi : ${image.name}`}
                </p>

                <label htmlFor="project-usage">
                  Comment utiliserez-vous les fonds ?
                </label>

                <textarea
                  id="project-usage"
                  name="fundsUsage"
                  value={form.fundsUsage}
                  onChange={updateField}
                  maxLength={1000}
                  placeholder="Décrivez les achats, actions ou dépenses prévus."
                  required
                />
              </fieldset>

              <fieldset disabled={locked}>
                <legend>
                  Le financement
                </legend>

                <div className="creation-fields">
                  <div>
                    <label htmlFor="project-goal">
                      Objectif en ETH
                    </label>

                    <input
                      id="project-goal"
                      name="goal"
                      value={form.goal}
                      onChange={updateField}
                      inputMode="decimal"
                      placeholder="Exemple : 2.5"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="project-duration">
                      Durée en jours
                    </label>

                    <input
                      id="project-duration"
                      name="duration"
                      type="number"
                      min="1"
                      max="90"
                      step="1"
                      value={form.duration}
                      onChange={updateField}
                      required
                    />
                  </div>
                </div>

                <label htmlFor="project-beneficiary">
                  Adresse du bénéficiaire
                </label>

                <input
                  id="project-beneficiary"
                  name="beneficiary"
                  value={form.beneficiary}
                  onChange={updateField}
                  placeholder="0x…"
                  spellCheck={false}
                  required
                />

                <button
                  type="button"
                  className="creation-secondary"
                  disabled={!account}
                  onClick={() => {
                    setForm((previous) => ({
                      ...previous,
                      beneficiary: account,
                    }));
                  }}
                >
                  Utiliser mon adresse
                </button>

                <p>
                  Cette adresse pourra demander puis
                  recevoir le retrait autorisé.
                </p>
              </fieldset>

              <button type="submit" disabled={locked}>
                Prévisualiser mon projet
              </button>
            </form>
          ) : (
            <article className="creation-review">
              <p className="tiwizi-overline">
                {form.category}
              </p>

              <h2>{form.title}</h2>

              <p className="creation-summary">
                {form.summary}
              </p>

              <h3>Le projet</h3>

              <p className="creation-text">
                {form.description}
              </p>

              <h3>Utilisation des fonds</h3>

              <p className="creation-text">
                {form.fundsUsage}
              </p>

              <dl className="creation-review-details">
                <div>
                  <dt>Objectif</dt>
                  <dd>{form.goal} ETH</dd>
                </div>

                <div>
                  <dt>Durée</dt>
                  <dd>{form.duration} jours</dd>
                </div>

                <div>
                  <dt>Bénéficiaire</dt>
                  <dd>{form.beneficiary}</dd>
                </div>

                <div>
                  <dt>Image choisie</dt>
                  <dd>{image?.name}</dd>
                </div>
              </dl>

              <div className="creation-notice">
                <h3>Avant de publier</h3>

                <p>
                  L’image et la présentation seront publiques
                  sur IPFS. L’objectif, l’échéance, le créateur,
                  le bénéficiaire et la référence IPFS seront
                  enregistrés sur la blockchain.
                </p>

                <p>
                  Ces informations ne pourront pas être
                  modifiées depuis cette campagne après
                  publication. La durée commence lorsque
                  la transaction de création est confirmée.
                </p>

                <p>
                  Le retrait nécessite l’autorisation de la
                  gouvernance et, au-delà de 0,5 ETH brut,
                  celle du multisig. Les frais de plateforme
                  sont de 3 % au retrait. Les frais réseau
                  sont distincts.
                </p>
              </div>

              <div className="creation-actions">
                <button
                  type="button"
                  className="creation-secondary"
                  disabled={locked}
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                >
                  Modifier les informations
                </button>

                <button
                  type="button"
                  onClick={publish}
                  disabled={
                    locked ||
                    !connected ||
                    !correctNetwork
                  }
                >
                  {busy
                    ? "Publication en cours…"
                    : "Publier mon projet"}
                </button>
              </div>

              {!connected && (
                <p>
                  Connectez votre portefeuille pour publier.
                </p>
              )}

              {connected && !correctNetwork && (
                <p>
                  Sélectionnez le réseau de Tiwizi dans
                  votre portefeuille pour publier.
                </p>
              )}
            </article>
          )}
        </>
      )}

      {message && (
        <p role="status">
          {message}
        </p>
      )}

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {metadataURI && (
        <details className="creation-references">
          <summary>
            Référence de la présentation
          </summary>

          <p>{metadataURI}</p>

          <p>
            Conservez cette référence si vous interrompez
            la publication après l’envoi des fichiers.
          </p>
        </details>
      )}

      {transactionHash && (
        <div className="creation-references">
          <p>
            Transaction : {transactionHash}
          </p>

          {!published && (
            <button
              type="button"
              disabled={busy}
              onClick={checkTransaction}
            >
              Vérifier la confirmation
            </button>
          )}
        </div>
      )}
    </section>
  );
}