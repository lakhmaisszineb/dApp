import { mkdir, writeFile } from "node:fs/promises";
import { network, artifacts } from "hardhat";

async function main() {
  const connection = await network.connect();
  const { ethers } = connection;

  const [deployer] = await ethers.getSigners();
  console.log("Deployer :", deployer.address);
  console.log("Balance  :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  //  3 signataires MultiSig 
  // Remplace par 3 adresses MetaMask de ton équipe (ou 3 de tes comptes de test)
  const signataires = [
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  ];

  // 1. Crowdfunding
  const crowdfunding = await ethers.deployContract("Crowdfunding", [deployer.address]);
  await crowdfunding.waitForDeployment();
  const crowdfundingAddress = await crowdfunding.getAddress();
  console.log("Crowdfunding :", crowdfundingAddress);

  // 2. Governance
  const governance = await ethers.deployContract("Governance", [
    deployer.address,
    crowdfundingAddress,
  ]);
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log("Governance   :", governanceAddress);

  // 3. MultiSig
  const multiSig = await ethers.deployContract("MultiSig", [signataires]);
  await multiSig.waitForDeployment();
  const multiSigAddress = await multiSig.getAddress();
  console.log("MultiSig     :", multiSigAddress);

  // Configuration
  await (await crowdfunding.connect(deployer).setGovernance(governanceAddress)).wait();
  await (await crowdfunding.connect(deployer).setMultiSig(multiSigAddress)).wait();

  // Export des adresses
  const outputDirectory = new URL("../frontend/src/contracts/", import.meta.url);
  await mkdir(outputDirectory, { recursive: true });

  const deployment = {
    chainId: 11155111,
    crowdfunding: crowdfundingAddress,
    governance: governanceAddress,
    multiSig: multiSigAddress,
    admin: deployer.address,
    signataires,
  };

  await writeFile(
    new URL("deployment-sepolia.json", outputDirectory),
    JSON.stringify(deployment, null, 2),
    "utf8"
  );

  // Export des ABI
  for (const name of ["Crowdfunding", "Governance", "MultiSig", "CFDToken"]) {
    const artifact = await artifacts.readArtifact(name);
    await writeFile(
      new URL(`${name}.json`, outputDirectory),
      JSON.stringify({ abi: artifact.abi }, null, 2),
      "utf8"
    );
  }

  console.log("\n Déploiement Sepolia terminé !");
  console.log("Fichier créé : frontend/src/contracts/deployment-sepolia.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});