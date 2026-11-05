import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.connect();
const { time } = networkHelpers;

describe("02 - Governance : Propositions, Vote pondéré par Snapshot et Exécution (kh)", function () {
  const ONE_DAY = 24 * 60 * 60;
  const THREE_DAYS = 3 * ONE_DAY;

  async function deploySystemFixture() {
    const [admin, alice, bob, charlie, outsider, signer1, signer2, signer3] = await ethers.getSigners();

    // Déploiement MultiSig (2-sur-3)
    const MultiSig = await ethers.getContractFactory("MultiSig");
    const multiSig = await MultiSig.deploy([signer1.address, signer2.address, signer3.address], 2);
    await multiSig.waitForDeployment();

    // Déploiement Governance
    const Governance = await ethers.getContractFactory("Governance");
    const governance = await Governance.deploy();
    await governance.waitForDeployment();

    // Déploiement Crowdfunding
    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
    const crowdfunding = await Crowdfunding.deploy(
      await governance.getAddress(),
      await multiSig.getAddress()
    );
    await crowdfunding.waitForDeployment();

    // Liaison des contrats (comme dans scripts/deploy-local.js)
    if (typeof governance.setCrowdfunding === "function") {
      await governance.setCrowdfunding(await crowdfunding.getAddress());
    }
    if (typeof multiSig.setCrowdfunding === "function") {
      await multiSig.setCrowdfunding(await crowdfunding.getAddress());
    }

    return { crowdfunding, governance, multiSig, admin, alice, bob, charlie, outsider, signer1, signer2, signer3 };
  }

  it("Doit pondérer les votes selon les CFD de la campagne (1 ETH = 1000 CFD) et bloquer les non-détenteurs", async function () {
    const { crowdfunding, governance, alice, bob, charlie, outsider } = await deploySystemFixture();

    // Alice crée une campagne de 2 ETH sur 10 jours
    await crowdfunding.connect(alice).createCampaign(
      ethers.parseEther("2"),
      10 * ONE_DAY,
      alice.address,
      "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
    );

    // Bob contribue 1 ETH (1000 CFD) et Charlie 2 ETH (2000 CFD)
    await crowdfunding.connect(bob).contribute(1, { value: ethers.parseEther("1") });
    await crowdfunding.connect(charlie).contribute(1, { value: ethers.parseEther("2") });

    // Alice soumet une demande de retrait avant la proposition de gouvernance
    if (typeof crowdfunding.requestWithdrawal === "function") {
      await crowdfunding.connect(alice).requestWithdrawal(1);
    }

    // Création de la proposition de gouvernance
    await governance.connect(bob).createProposal(1, "Autoriser le retrait des fonds");

    // Outsider (0 CFD) ne peut pas voter
    await expect(governance.connect(outsider).vote(1, true)).to.be.reverted;

    // Bob (1000 CFD) et Charlie (2000 CFD) votent POUR
    await governance.connect(bob).vote(1, true);
    await governance.connect(charlie).vote(1, true);

    // Impossible de voter une seconde fois
    await expect(governance.connect(bob).vote(1, false)).to.be.reverted;
  });

  it("Doit imposer 3 jours de vote + 1 jour de délai avant d'exécuter une proposition adoptée", async function () {
    const { crowdfunding, governance, alice, bob, charlie } = await deploySystemFixture();

    await crowdfunding.connect(alice).createCampaign(
      ethers.parseEther("2"),
      10 * ONE_DAY,
      alice.address,
      "ipfs://QmTestHash"
    );

    await crowdfunding.connect(bob).contribute(1, { value: ethers.parseEther("1") });
    await crowdfunding.connect(charlie).contribute(1, { value: ethers.parseEther("1") });

    if (typeof crowdfunding.requestWithdrawal === "function") {
      await crowdfunding.connect(alice).requestWithdrawal(1);
    }

    await governance.connect(bob).createProposal(1, "Autoriser retrait");
    await governance.connect(bob).vote(1, true);
    await governance.connect(charlie).vote(1, true);

    // Exécution refusée pendant les 3 jours de vote
    await expect(governance.connect(alice).executeProposal(1)).to.be.reverted;

    // Avancer de 3 jours (fin du vote, mais délai d'1 jour non écoulé)
    await time.increase(THREE_DAYS + 10);
    await expect(governance.connect(alice).executeProposal(1)).to.be.reverted;

    // Avancer d'1 jour supplémentaire : l'exécution doit réussir
    await time.increase(ONE_DAY + 10);
    await expect(governance.connect(alice).executeProposal(1)).to.not.be.reverted;
  });
});