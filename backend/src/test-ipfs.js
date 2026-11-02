import dotenv from "dotenv";
import { PinataSDK } from "pinata";

// Charge précisément backend/.env, même si le script est lancé
// depuis un autre dossier.
dotenv.config({
    path: new URL("../.env", import.meta.url),
    quiet: true,
});

async function main() {
    const jwt = process.env.PINATA_JWT?.trim();
    const gateway = process.env.PINATA_GATEWAY?.trim();

    // Vérifier la configuration sans afficher le secret.
    if (!jwt) {
        throw new Error("PINATA_JWT manque dans backend/.env");
    }

    if (!gateway) {
        throw new Error("PINATA_GATEWAY manque dans backend/.env");
    }

    if (
        gateway.includes("://") ||
        gateway.includes("/") ||
        /\s/.test(gateway)
    ) {
        throw new Error(
            "PINATA_GATEWAY doit contenir seulement le domaine, " +
            "par exemple : exemple.mypinata.cloud"
        );
    }

    // Configure l'accès au compte Pinata.
    const pinata = new PinataSDK({
        pinataJwt: jwt,
        pinataGateway: gateway,
    });

    // Données publiques utilisées pour ce premier essai.
    // Plus tard, elles proviendront du formulaire.
    const metadata = {
        schemaVersion: "1.0",
        title: "Campagne de test IPFS",
        summary: "Premier essai de stockage de métadonnées.",
        description:
            "Ce fichier vérifie que notre backend peut envoyer " +
            "les métadonnées d'une campagne sur IPFS.",
        category: "Education",
        fundsUsage: [
            {
                label: "Matériel pédagogique",
                description: "Achat du matériel nécessaire au projet.",
            },
        ],
        documents: [],
    };

    // Transforme l'objet JavaScript en fichier JSON.
    const file = new File(
        [JSON.stringify(metadata, null, 2)],
        "campaign-test.json",
        { type: "application/json" }
    );

    console.log("Envoi des métadonnées sur IPFS...");

    // Envoie le fichier sur le réseau IPFS public.
    const upload = await pinata.upload.public.file(file);

    if (!upload.cid) {
        throw new Error("Pinata n'a pas retourné de CID.");
    }

    const metadataURI = `ipfs://${upload.cid}`;
    const readURL = `https://${gateway}/ipfs/${upload.cid}`;

    // Ces références sont publiques ; le JWT n'est jamais affiché.
    console.log("\nEnvoi réussi !");
    console.log("CID :", upload.cid);
    console.log("Référence à enregistrer dans le contrat :", metadataURI);
    console.log("Adresse de lecture :", readURL);

    console.log("\nVérification de la lecture...");

    const response = await fetch(readURL, {
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        throw new Error(
            `Le fichier est envoyé, mais sa lecture retourne HTTP ` +
            `${response.status}. Réessaie l'adresse dans ton navigateur.`
        );
    }

    const retrieved = await response.json();

    if (JSON.stringify(retrieved) !== JSON.stringify(metadata)) {
        throw new Error(
            "Le JSON récupéré ne correspond pas au JSON envoyé."
        );
    }

    console.log("Lecture réussie : les métadonnées sont identiques.");
    console.log("Titre récupéré :", retrieved.title);
}

main().catch((error) => {
    // Évite d'afficher l'objet d'erreur complet qui pourrait
    // contenir des informations liées à la requête.
    let message = String(error.message ?? "Erreur inconnue");

    const jwt = process.env.PINATA_JWT?.trim();

    if (jwt) {
        message = message.split(jwt).join("[SECRET MASQUÉ]");
    }

    console.error("\nÉchec :", message);
    process.exitCode = 1;
});