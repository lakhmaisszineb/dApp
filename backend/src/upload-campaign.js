import dotenv from "dotenv";
import { PinataSDK } from "pinata";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

// Charger backend/.env indépendamment du dossier du terminal.
dotenv.config({
    path: new URL("../.env", import.meta.url),
    quiet: true,
});

async function main() {
    const jwt = process.env.PINATA_JWT?.trim();
    const gateway = process.env.PINATA_GATEWAY?.trim();

    // ----------------------------------------------------------
    // 1. Vérifier la configuration
    // ----------------------------------------------------------

    if (!jwt || !gateway) {
        throw new Error(
            "Vérifie PINATA_JWT et PINATA_GATEWAY dans backend/.env."
        );
    }

    if (
        gateway.includes("://") ||
        gateway.includes("/") ||
        /\s/.test(gateway)
    ) {
        throw new Error(
            "PINATA_GATEWAY doit contenir uniquement le domaine, " +
            "sans https:// ni /ipfs/."
        );
    }

    const pinata = new PinataSDK({
        pinataJwt: jwt,
        pinataGateway: gateway,
    });

    // ----------------------------------------------------------
    // 2. Lire et reconnaître l'image locale
    // ----------------------------------------------------------

    const imagePath = new URL(
        "../samples/campaign1.jpg",
        import.meta.url
    );

    let imageBytes;

    try {
        imageBytes = await readFile(imagePath);
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(
                "Image introuvable : place campaign1.jpg " +
                "dans backend/samples."
            );
        }

        throw error;
    }

    const maxSize = 5 * 1024 * 1024;

    if (imageBytes.length > maxSize) {
        throw new Error("L'image dépasse la limite de 5 Mo.");
    }

    // Identifier le format à partir du contenu du fichier.
    // Ce contrôle de signature ne remplace pas un décodage complet.
    const pngSignature = Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const isPng =
        imageBytes.length >= 8 &&
        imageBytes.subarray(0, 8).equals(pngSignature);

    const isJpeg =
        imageBytes.length >= 3 &&
        imageBytes[0] === 0xff &&
        imageBytes[1] === 0xd8 &&
        imageBytes[2] === 0xff;

    if (!isPng && !isJpeg) {
        throw new Error(
            "campaign1.jpg ne contient pas une image PNG ou JPEG reconnue. " +
            "Ouvre l'image dans Paint et enregistre-la au format JPEG."
        );
    }

    // Le nom envoyé et le type correspondent au format détecté.
    const imageFileName = isPng
        ? "campaign1.png"
        : "campaign1.jpg";

    const imageMimeType = isPng
        ? "image/png"
        : "image/jpeg";

    console.log("Format détecté :", imageMimeType);

    // ----------------------------------------------------------
    // 3. Envoyer l'image sur IPFS public
    // ----------------------------------------------------------

    console.log("\n1/4 — Envoi de l'image...");

    const imageFile = new File(
        [imageBytes],
        imageFileName,
        { type: imageMimeType }
    );

    const imageUpload =
        await pinata.upload.public.file(imageFile);

    if (!imageUpload.cid) {
        throw new Error("Aucun CID retourné pour l'image.");
    }

    const imageURI = `ipfs://${imageUpload.cid}`;

    console.log("Image envoyée :", imageURI);

    // ----------------------------------------------------------
    // 4. Construire et envoyer les métadonnées
    // ----------------------------------------------------------

    // Ces valeurs remplaceront plus tard les données du formulaire.
    // Les paramètres financiers restent enregistrés dans Crowdfunding.
    const metadata = {
        schemaVersion: "1.0",

        title: "Financement de matériel pédagogique",

        summary:
            "Collecter des fonds pour acheter du matériel pédagogique.",

        description:
            "Notre campagne vise à financer du matériel destiné " +
            "aux activités pédagogiques. Les fonds seront utilisés " +
            "pour les achats décrits ci-dessous.",

        category: "Education",

        // Référence réelle de l'image envoyée précédemment.
        image: imageURI,

        fundsUsage: [
            {
                label: "Matériel pédagogique",
                description:
                    "Achat du matériel nécessaire aux activités.",
            },
            {
                label: "Accessoires",
                description:
                    "Achat des accessoires nécessaires à son utilisation.",
            },
        ],

        documents: [],
        links: [],
    };

    console.log("2/4 — Envoi des métadonnées...");

    const metadataFile = new File(
        [JSON.stringify(metadata, null, 2)],
        "campaign-metadata.json",
        { type: "application/json" }
    );

    const metadataUpload =
        await pinata.upload.public.file(metadataFile);

    if (!metadataUpload.cid) {
        throw new Error("Aucun CID retourné pour les métadonnées.");
    }

    const metadataURI = `ipfs://${metadataUpload.cid}`;

    const metadataURL =
        `https://${gateway}/ipfs/${metadataUpload.cid}`;

    const imageURL =
        `https://${gateway}/ipfs/${imageUpload.cid}`;

    // ----------------------------------------------------------
    // 5. Sauvegarder les références publiques localement
    // ----------------------------------------------------------

    const result = {
        metadataCID: metadataUpload.cid,
        metadataURI,
        metadataURL,

        imageCID: imageUpload.cid,
        imageURI,
        imageURL,
    };

    const outputDirectory = new URL(
        "../output/",
        import.meta.url
    );

    await mkdir(outputDirectory, { recursive: true });

    await writeFile(
        new URL("campaign-upload.json", outputDirectory),
        JSON.stringify(result, null, 2),
        "utf8"
    );

    console.log("\nRéférence à utiliser dans Crowdfunding :");
    console.log(metadataURI);

    console.log("\nJSON :", metadataURL);
    console.log("Image :", imageURL);

    console.log(
        "\nRéférences enregistrées dans output/campaign-upload.json"
    );

    // ----------------------------------------------------------
    // 6. Télécharger et vérifier le JSON
    // ----------------------------------------------------------

    console.log("\n3/4 — Vérification du JSON...");

    const metadataResponse = await fetch(metadataURL, {
        signal: AbortSignal.timeout(30000),
    });

    if (!metadataResponse.ok) {
        throw new Error(
            `Envoi terminé, mais lecture du JSON impossible : ` +
            `HTTP ${metadataResponse.status}. ` +
            `Les références sont dans output/campaign-upload.json.`
        );
    }

    const retrieved = await metadataResponse.json();

    // Comparer les données sans dépendre de l'ordre des propriétés.
    if (!isDeepStrictEqual(retrieved, metadata)) {
        throw new Error(
            "Les métadonnées récupérées diffèrent de celles envoyées."
        );
    }

    console.log("JSON récupéré et conforme.");

    // ----------------------------------------------------------
    // 7. Télécharger et vérifier l'image
    // ----------------------------------------------------------

    console.log("4/4 — Vérification de l'image...");

    const imageResponse = await fetch(imageURL, {
        signal: AbortSignal.timeout(30000),
    });

    if (!imageResponse.ok) {
        throw new Error(
            `Envoi terminé, mais lecture de l'image impossible : ` +
            `HTTP ${imageResponse.status}. ` +
            `Les références sont dans output/campaign-upload.json.`
        );
    }

    const downloadedImage = Buffer.from(
        await imageResponse.arrayBuffer()
    );

    // Vérifier que l'image téléchargée correspond exactement
    // au fichier local envoyé.
    if (!downloadedImage.equals(imageBytes)) {
        throw new Error(
            "L'image récupérée diffère du fichier envoyé."
        );
    }

    console.log("Image récupérée et identique.");
    console.log("\nParcours IPFS terminé avec succès.");
}

main().catch((error) => {
    let message = String(
        error.message ?? "Erreur inconnue"
    );

    // Ne pas afficher le JWT si une erreur le contient.
    const jwt = process.env.PINATA_JWT?.trim();

    if (jwt) {
        message = message.split(jwt).join("[SECRET MASQUÉ]");
    }

    console.error("\nErreur :", message);
    process.exitCode = 1;
});