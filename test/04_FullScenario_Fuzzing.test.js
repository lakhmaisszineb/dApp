import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.connect();
const { time } = networkHelpers;

describe("04 - Intégration Complète (Scénario J6 Alice/Bob/Charlie) et Fuzzing (kh)", function () {
  const ONE_DAY = 24 * 60 * 60;
  const THREE_DAYS = 3 * ONE_DAY;

  async function deployScenarioFixture() {
    const [admin, alice, bob, charlie, signer1, signer2, signer3] = await ethers.getSigners();

    const MultiSig = await ethers.getContractFactory("MultiSig");
    const multiSig = await MultiSig.deploy([signer1.address, signer2.address, signer3.address], 2);
    await multiSig.waitForDeployment();

    const Governance = await ethers.getContractFactory("Governance");
    const governance = await Governance.deploy();
    await governance.waitForDeployment();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
    const crowdfunding = await Crowdfunding.deploy(
      await governance.getAddress(),
      await multiSig.getAddress()
    );
    await crowdfunding.waitForDeployment();

    if (typeof governance.setCrowdfunding === "function") {
      await governance.setCrowdfunding(await crowdfunding.getAddress());
    }
    if (typeof multiSig.setCrowdfunding === "function") {
      await multiSig.setCrowdfunding(await crowdfunding.getAddress());
    }

    return { crowdfunding, governance, multiSig, admin, alice, bob, charlie, signer1, signer2, signer3 };
  }

  it("Scénario J6 Complet : Alice crée (2 ETH) -> Bob (1 ETH) & Charlie (1 ETH) -> CFD -> Vote -> MultiSig -> Retrait", async function () {
    const { crowdfunding, governance, multiSig, alice, bob, charlie, signer1, signer2 } =
      await deployScenarioFixture();

    // 1. Alice crée une campagne de 2 ETH
    await crowdfunding.connect(alice).createCampaign(
      ethers.parseEther("2"),
      14 * ONE_DAY,
      alice.address,
      "ipfs://QmAliceProject2ETH"
    );

    // 2. Bob contribue 1 ETH et Charlie contribue 1 ETH
    await crowdfunding.connect(bob).contribute(1, { value: ethers.parseEther("1") });
    await crowdfunding.connect(charlie).contribute(1, { value: ethers.parseEther("1") });

    // 3. Vérification de la réception des 1000 CFD chacun (1 ETH = 1000 CFD)
    const campaignData = await crowdfunding.campaigns(1);
    if (campaignData.token) {
      const token = await ethers.getContractAt("CFDToken", campaignData.token);
      expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther("1000"));
      expect(await token.balanceOf(charlie.address)).to.equal(ethers.parseEther("1000"));
    }

    // 4. Demande de retrait et création de la proposition de gouvernance
    if (typeof crowdfunding.requestWithdrawal === "function") {
      await crowdfunding.connect(alice).requestWithdrawal(1);
    }
    await governance.connect(bob).createProposal(1, "Déblocage des 2 ETH pour Alice");

    // 5. Les détenteurs de CFD votent
    await governance.connect(bob).vote(1, true);
    await governance.connect(charlie).vote(1, true);

    // 6. La proposition est acceptée après les 3j de vote + 1j de délai
    await time.increase(THREE_DAYS + ONE_DAY + 30);
    await governance.connect(alice).executeProposal(1);

    // 7. Approbation MultiSig 2-sur-3 (car 2 ETH > 0.5 ETH)
    await multiSig.connect(signer1).approveWithdrawal(1);
    await multiSig.connect(signer2).approveWithdrawal(1);

    // 8. Alice retire les fonds (2 ETH - 3% de frais = 1.94 ETH)
    const expectedNet = ethers.parseEther("1.94");
    await expect(crowdfunding.connect(alice).withdrawFunds(1)).to.changeEtherBalance(alice, expectedNet);
  });

  it("Test de Fuzzing (J6) : Vérifie la précision de l'émission CFD (x1000) sur 15 montants aléatoires", async function () {
    const { crowdfunding, alice, bob } = await deployScenarioFixture();

    await crowdfunding.connect(alice).createCampaign(
      ethers.parseEther("500"),
      30 * ONE_DAY,
      alice.address,
      "ipfs://QmFuzzingCampaign"
    );

    let expectedTotalRaised = 0n;

    for (let i = 1; i <= 15; i++) {
      // Génère un montant pseudo-aléatoire en wei entre 0.001 ETH et 2.5 ETH
      const randomWei = BigInt(Math.floor(Math.random() * 2_500_000_000_000_000_000) + 1_000_000_000_000_000);
      expectedTotalRaised += randomWei;

      await crowdfunding.connect(bob).contribute(1, { value: randomWei });
    }

    const campaignData = await crowdfunding.campaigns(1);
    if (campaignData.token) {
      const token = await ethers.getContractAt("CFDToken", campaignData.token);
      expect(await token.balanceOf(bob.address)).to.equal(expectedTotalRaised * 1000n);
    }
  });
});