import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { network } from "hardhat";

// Adresse publique du compte affiché dans ta capture MetaMask.
// Si tu changes de compte, remplace cette adresse.
const TEST_ACCOUNT =
    "0xc769662d7b53a3c50ea4a31b9f47358297772eaa";

async function main() {
    // Lire les adresses utilisées par le frontend.
    const deployment = JSON.parse(
        await readFile(
            new URL(
                "../frontend/src/contracts/deployment.json",
                import.meta.url
            ),
            "utf8"
        )
    );

    // Réutiliser les métadonnées déjà envoyées sur IPFS.
    const uploaded = JSON.parse(
        await readFile(
            new URL(
                "../backend/output/campaign-api-result.json",
                import.meta.url
            ),
            "utf8"
        )
    );

    if (
        typeof uploaded.metadataURI !== "string" ||
        !uploaded.metadataURI.startsWith("ipfs://") ||
        uploaded.metadataURI.length <= 7
    ) {
        throw new Error("La référence IPFS est absente ou invalide.");
    }

    const connection = await network.getOrCreate("localhost");

    try {
        const { ethers } = connection;

        const currentNetwork =
            await ethers.provider.getNetwork();

        assert.equal(
            currentNetwork.chainId,
            31337n,
            "Ce script fonctionne uniquement sur Hardhat local."
        );

        assert.equal(
            deployment.chainId,
            31337,
            "Le fichier de déploiement doit cibler Hardhat local."
        );

        const account = ethers.getAddress(TEST_ACCOUNT);

        const code = await ethers.provider.getCode(
            deployment.crowdfunding
        );

        if (code === "0x") {
            throw new Error(
                "Crowdfunding est absent du réseau local. " +
                "Vérifie le nœud et le déploiement."
            );
        }

        const [fundedAccount] = await ethers.getSigners();

        const crowdfunding = await ethers.getContractAt(
            "Crowdfunding",
            deployment.crowdfunding,
            fundedAccount
        );

        if (await crowdfunding.paused()) {
            throw new Error(
                "La plateforme est en pause. Aucune campagne créée."
            );
        }

        // Préparer une campagne ouverte pendant 30 jours.
        // Le compte MetaMask sera aussi le bénéficiaire.
        console.log("Création d'une campagne de test...");

        const tx = await crowdfunding.createCampaign(
            ethers.parseEther("2"),
            30 * 24 * 60 * 60,
            account,
            uploaded.metadataURI
        );

        const receipt = await tx.wait();

        // Retrouver l'identifiant dans l'événement de cette transaction.
        let campaignId;

        for (const log of receipt.logs) {
            if (
                log.address.toLowerCase() !==
                deployment.crowdfunding.toLowerCase()
            ) {
                continue;
            }

            try {
                const parsed = crowdfunding.interface.parseLog(log);

                if (parsed?.name === "CampaignCreated") {
                    campaignId = parsed.args.campaignId;
                    break;
                }
            } catch {
                // Ignorer les événements non reconnus.
            }
        }

        if (campaignId === undefined) {
            throw new Error(
                "Transaction confirmée, mais identifiant non retrouvé."
            );
        }

        console.log("Campagne créée :", campaignId.toString());
        console.log("Objectif : 2 ETH");
        console.log("Durée : 30 jours");
        console.log("Bénéficiaire :", account);

        // Envoyer des ETH de test depuis un compte financé de Hardhat.
        console.log("\nEnvoi de 10 ETH locaux au compte MetaMask...");

        const fundingTx = await fundedAccount.sendTransaction({
            to: account,
            value: ethers.parseEther("10"),
        });

        await fundingTx.wait();

        const balance = await ethers.provider.getBalance(
            account,
            "latest"
        );

        console.log(
            "Solde local du compte :",
            ethers.formatEther(balance),
            "ETH"
        );

        console.log(
            "\nDans le site, charge la campagne",
            campaignId.toString(),
            "pour tester une contribution."
        );
    } finally {
        await connection.close();
    }
}

main().catch((error) => {
    console.error("Erreur :", error.message);
    process.exitCode = 1;
});