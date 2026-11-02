import { PinataSDK } from "pinata";
import { config } from "../config.js";

const pinata = new PinataSDK({
    pinataJwt: config.pinataJwt,
    pinataGateway: config.pinataGateway,
});

/**
 * Envoie une image déjà vérifiée, puis les métadonnées.
 *
 * Ce service ne crée pas la campagne sur la blockchain.
 * Il retourne les références nécessaires au frontend.
 */
export async function uploadCampaignMetadata({
    title,
    summary,
    description,
    category,
    fundsUsage,
    imageBuffer,
}) {
    // La route convertit l'image reçue au format JPEG.
    const imageFile = new File(
        [imageBuffer],
        "campaign.jpg",
        { type: "image/jpeg" }
    );

    const imageUpload =
        await pinata.upload.public.file(imageFile);

    if (!imageUpload.cid) {
        throw new Error("Missing image CID");
    }

    const imageURI = `ipfs://${imageUpload.cid}`;

    const metadata = {
        schemaVersion: "1.0",
        title,
        summary,
        description,
        category,
        image: imageURI,
        fundsUsage,

        // Ces fonctionnalités ne sont pas encore proposées
        // par notre route.
        documents: [],
        links: [],
    };

    const metadataFile = new File(
        [JSON.stringify(metadata, null, 2)],
        "campaign-metadata.json",
        { type: "application/json" }
    );

    const metadataUpload =
        await pinata.upload.public.file(metadataFile);

    if (!metadataUpload.cid) {
        throw new Error("Missing metadata CID");
    }

    return {
        metadataCID: metadataUpload.cid,
        metadataURI: `ipfs://${metadataUpload.cid}`,
        metadataURL:
            `https://${config.pinataGateway}/ipfs/${metadataUpload.cid}`,

        imageCID: imageUpload.cid,
        imageURI,
        imageURL:
            `https://${config.pinataGateway}/ipfs/${imageUpload.cid}`,
    };
}