import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { network } from "hardhat";

async function main() {
    // 1. Lire les références retournées par notre backend.
    const resultPath = new URL(
        "../backend/output/campaign-api-result.json",
        import.meta.url
    );

    const result = JSON.parse(
        await readFile(resultPath, "utf8")
    );

    const metadataURI = result.metadataURI;

    if (
        typeof metadataURI !== "string" ||
        !metadataURI.startsWith("ipfs://") ||
        metadataURI.length <= "ipfs://".length
    ) {
        throw new Error(
            "metadataURI est absente ou invalide dans " +
            "backend/output/campaign-api-result.json."
        );
    }

    console.log("Référence IPFS :", metadataURI);

    // 2. Utiliser explicitement un réseau simulé local.
    // Aucun réseau public ni clé privée personnelle n'est utilisé.
    const connection = await network.create({
        type: "edr-simulated",
        chainType: "l1",
    });

    try {
        const { ethers } = connection;

        const [admin, creator, beneficiary] =
            await ethers.getSigners();

        // 3. Déployer une plateforme de test.
        const crowdfunding = await ethers.deployContract(
            "Crowdfunding",
            [admin.address]
        );

        await crowdfunding.waitForDeployment();

        console.log(
            "Crowdfunding de test :",
            await crowdfunding.getAddress()
        );

        // 4. Préparer les paramètres financiers.
        const goal = ethers.parseEther("2");
        const duration = 7n * 24n * 60n * 60n;

        // 5. Créer une campagne liée aux métadonnées IPFS.
        const tx = await crowdfunding
            .connect(creator)
            .createCampaign(
                goal,
                duration,
                beneficiary.address,
                metadataURI
            );

        await tx.wait();

        // Ce déploiement est neuf et le script crée une seule campagne.
        const campaignId = await crowdfunding.campaignCount();

        // 6. Relire les données réellement enregistrées.
        const campaign = await crowdfunding.campaigns(
            campaignId
        );

        assert.equal(
            campaign.ipfsHash,
            metadataURI,
            "La référence IPFS enregistrée est incorrecte."
        );

        assert.equal(
            campaign.creator,
            creator.address,
            "Le créateur enregistré est incorrect."
        );

        assert.equal(
            campaign.beneficiary,
            beneficiary.address,
            "Le bénéficiaire enregistré est incorrect."
        );

        assert.equal(
            campaign.goal,
            goal,
            "L'objectif enregistré est incorrect."
        );

        // Vérifier aussi l'association avec le token de campagne.
        const token = await ethers.getContractAt(
            "CFDToken",
            campaign.token
        );

        assert.equal(
            await token.campaignId(),
            campaignId,
            "Le token est associé à une autre campagne."
        );

        console.log("\nCampagne créée :", campaignId.toString());
        console.log("Référence relue :", campaign.ipfsHash);
        console.log("Token CFD :", campaign.token);

        console.log(
            "\nVérification réussie : la campagne conserve " +
            "la bonne référence IPFS."
        );
    } finally {
        await connection.close();
    }
}

main().catch((error) => {
    console.error("Échec :", error.message);
    process.exitCode = 1;
});