import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.connect();
const { time } = networkHelpers;

describe("03 - Crowdfunding & MultiSig : Retraits, Frais 3%, Seuil 0.5 ETH et Sécurité (kh)", function () {
  const ONE_DAY = 24 * 60 * 60;
  const THREE_DAYS = 3 * ONE_DAY;

  async function deployPlatformFixture() {
    const [admin, alice, bob, charlie, attacker, signer1, signer2, signer3] = await ethers.getSigners();

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

    return { crowdfunding, governance, multiSig, admin, alice, bob, charlie, attacker, signer1, signer2, signer3 };
  }

  it("Doit permettre le remboursement (refund) uniquement si l'objectif n'est pas atteint après l'échéance", async function () {
    const { crowdfunding, alice, bob } = await deployPlatformFixture();

    // Objectif de 5 ETH sur 5 jours
    await crowdfunding.connect(alice).createCampaign(
      ethers.parseEther("5"),
      5 * ONE_DAY,
      alice.address,
      "ipfs://QmFailedCampaign"
    );

    // Bob contribue seulement 1.5 ETH
    const bobContribution = ethers.parseEther("1.5");
    await crowdfunding.connect(bob).contribute(1, { value: bobContribution });

    // Remboursement refusé avant la fin
    await expect(crowdfunding.connect(bob).refund(1)).to.be.reverted;

    // Avancer après l'échéance
    await time.increase(5 * ONE_DAY + 10);

    // Bob récupère ses 1.5 ETH et ne peut pas être remboursé deux fois
    await expect(crowdfunding.connect(bob).refund(1)).to.changeEtherBalance(bob, bobContribution);
    await expect(crowdfunding.connect(bob).refund(1)).to.be.reverted;
  });

  it("Doit bloquer les contributions lorsque la plateforme est en pause ou la campagne gelée", async function () {
    const { crowdfunding, admin, alice, bob, attacker } = await deployPlatformFixture();

    await crowdfunding.connect(alice).createCampaign(
      ethers.parseEther("2"),
      7 * ONE_DAY,
      alice.address,
      "ipfs://QmPauseTest"
    );

    // Seul l'admin peut mettre en pause
    await expect(crowdfunding.connect(attacker).pause()).to.be.reverted;

    await crowdfunding.connect(admin).pause();
    await expect(
      crowdfunding.connect(bob).contribute(1, { value: ethers.parseEther("1") })
    ).to.be.reverted;

    await crowdfunding.connect(admin).unpause();
    await expect(
      crowdfunding.connect(bob).contribute(1, { value: ethers.parseEther("1") })
    ).to.not.be.reverted;
  });

  it("Doit exiger l'approbation MultiSig 2-sur-3 pour tout retrait supérieur à 0.5 ETH", async function () {
    const { crowdfunding, governance, multiSig, alice, bob, charlie, attacker, signer1, signer2 } =
      await deployPlatformFixture();

    // Campagne de 1 ETH (> seuil de 0.5 ETH)
    await crowdfunding.connect(alice).createCampaign(
      ethers.parseEther("1"),
      7 * ONE_DAY,
      alice.address,
      "ipfs://QmMultiSigTest"
    );

    await crowdfunding.connect(bob).contribute(1, { value: ethers.parseEther("0.6") });
    await crowdfunding.connect(charlie).contribute(1, { value: ethers.parseEther("0.4") });

    if (typeof crowdfunding.requestWithdrawal === "function") {
      await crowdfunding.connect(alice).requestWithdrawal(1);
    }

    await governance.connect(bob).createProposal(1, "Validation retrait 1 ETH");
    await governance.connect(bob).vote(1, true);
    await governance.connect(charlie).vote(1, true);

    await time.increase(THREE_DAYS + ONE_DAY + 20);
    await governance.connect(alice).executeProposal(1);

    // Sans approbation MultiSig 2-sur-3, le retrait > 0.5 ETH échoue
    await expect(crowdfunding.connect(alice).withdrawFunds(1)).to.be.reverted;

    // Un utilisateur non autorisé ne peut pas signer dans le MultiSig
    await expect(multiSig.connect(attacker).approveWithdrawal(1)).to.be.reverted;

    // 1 seule signature sur 3 ne suffit pas
    await multiSig.connect(signer1).approveWithdrawal(1);
    await expect(crowdfunding.connect(alice).withdrawFunds(1)).to.be.reverted;

    // 2ème signature sur 3 : le retrait est débloqué (avec déduction des 3% de frais)
    await multiSig.connect(signer2).approveWithdrawal(1);
    const expectedNetAmount = ethers.parseEther("0.97"); // 1 ETH - 3% = 0.97 ETH
    await expect(crowdfunding.connect(alice).withdrawFunds(1)).to.changeEtherBalance(alice, expectedNetAmount);
  });
});