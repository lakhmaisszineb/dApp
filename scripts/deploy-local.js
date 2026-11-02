import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { network, artifacts } from "hardhat";

async function main() {
    const connection = await network.getOrCreate("localhost");

    try {
        const { ethers } = connection;

        const currentNetwork =
            await ethers.provider.getNetwork();

        assert.equal(
            currentNetwork.chainId,
            31337n,
            "Ce script est réservé au réseau local Hardhat 31337."
        );

        // Comptes fournis par le nœud Hardhat local.
        const accounts = await ethers.getSigners();

        if (accounts.length < 4) {
            throw new Error(
                "Quatre comptes locaux sont nécessaires."
            );
        }

        const [
            admin,
            signataire1,
            signataire2,
            signataire3,
        ] = accounts;

        const signataires = [
            signataire1.address,
            signataire2.address,
            signataire3.address,
        ];

        console.log("Administrateur :", admin.address);

        console.log("\nSignataires locaux du multisig :");

        signataires.forEach((address, index) => {
            console.log(
                `Signataire ${index + 1} : ${address}`
            );
        });

        // ------------------------------------------------------
        // 1. Déployer Crowdfunding
        // ------------------------------------------------------

        const crowdfunding = await ethers.deployContract(
            "Crowdfunding",
            [admin.address]
        );

        await crowdfunding.waitForDeployment();

        const crowdfundingAddress =
            await crowdfunding.getAddress();

        console.log("\nCrowdfunding :", crowdfundingAddress);

        // ------------------------------------------------------
        // 2. Déployer Governance
        // ------------------------------------------------------

        const governance = await ethers.deployContract(
            "Governance",
            [
                admin.address,
                crowdfundingAddress,
            ]
        );

        await governance.waitForDeployment();

        const governanceAddress =
            await governance.getAddress();

        console.log("Governance :", governanceAddress);

        // ------------------------------------------------------
        // 3. Déployer MultiSig
        // ------------------------------------------------------

        // Le constructeur attend UN argument :
        // un tableau contenant exactement trois adresses.
        const multiSig = await ethers.deployContract(
            "MultiSig",
            [signataires]
        );

        await multiSig.waitForDeployment();

        const multiSigAddress =
            await multiSig.getAddress();

        console.log("MultiSig :", multiSigAddress);

        // ------------------------------------------------------
        // 4. Configurer Crowdfunding
        // ------------------------------------------------------

        await (
            await crowdfunding
                .connect(admin)
                .setGovernance(governanceAddress)
        ).wait();

        await (
            await crowdfunding
                .connect(admin)
                .setMultiSig(multiSigAddress)
        ).wait();

        // Ces deux paramètres ne sont configurables
        // qu'une seule fois dans votre Crowdfunding.

        // ------------------------------------------------------
        // 5. Vérifier les liens
        // ------------------------------------------------------

        assert.equal(
            await crowdfunding.governance(),
            governanceAddress,
            "Adresse de gouvernance incorrecte."
        );

        assert.equal(
            await crowdfunding.multiSig(),
            multiSigAddress,
            "Adresse du multisig incorrecte."
        );

        assert.equal(
            await governance.crowdfunding(),
            crowdfundingAddress,
            "La gouvernance pointe vers une autre plateforme."
        );

        for (let index = 0; index < signataires.length; index++) {
            assert.equal(
                await multiSig.signataires(index),
                signataires[index],
                "Signataire enregistré incorrect."
            );

            assert.equal(
                await multiSig.isSignataire(signataires[index]),
                true,
                "Permission de signataire manquante."
            );
        }

        // ------------------------------------------------------
        // 6. Exporter les adresses
        // ------------------------------------------------------

        const outputDirectory = new URL(
            "../frontend/src/contracts/",
            import.meta.url
        );

        await mkdir(outputDirectory, {
            recursive: true,
        });

        const deployment = {
            chainId: Number(currentNetwork.chainId),
            crowdfunding: crowdfundingAddress,
            governance: governanceAddress,
            multiSig: multiSigAddress,
            admin: admin.address,
            signataires,
        };

        await writeFile(
            new URL("deployment.json", outputDirectory),
            JSON.stringify(deployment, null, 2),
            "utf8"
        );

        // ------------------------------------------------------
        // 7. Exporter les ABI des quatre contrats
        // ------------------------------------------------------

        for (const name of [
            "Crowdfunding",
            "Governance",
            "MultiSig",
            "CFDToken",
        ]) {
            const artifact =
                await artifacts.readArtifact(name);

            await writeFile(
                new URL(`${name}.json`, outputDirectory),
                JSON.stringify(
                    { abi: artifact.abi },
                    null,
                    2
                ),
                "utf8"
            );
        }

        console.log(
            "\nDéploiement terminé et liens vérifiés."
        );

        console.log(
            "Adresses et ABI exportées dans frontend/src/contracts."
        );

        console.log(
            "Les tokens CFD seront créés lors des créations de campagnes."
        );
    } finally {
        await connection.close();
    }
}

main().catch((error) => {
    console.error("Échec du déploiement :", error.message);
    process.exitCode = 1;
});