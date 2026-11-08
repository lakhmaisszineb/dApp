import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// Valeurs de l'enum ProposalType déclarée dans Governance.sol.
// Solidity : Withdrawal = 0, Freeze = 1, Unfreeze = 2, Cancel = 3.
const ProposalType = Object.freeze({
  Withdrawal: 0,
  Freeze: 1,
  Unfreeze: 2,
  Cancel: 3,
});

async function createCampaignAndGetToken(
  crowdfunding,
  creator,
  goal,
  duration,
  beneficiary,
  ipfsHash
) {
  const CFDToken = await ethers.getContractFactory("CFDToken");
  const roleGrantedTopic = CFDToken.interface.getEvent("RoleGranted").topicHash;

  const tx = await crowdfunding.connect(creator).createCampaign(
    goal,
    duration,
    beneficiary,
    ipfsHash
  );
  const receipt = await tx.wait();

  const tokenAddresses = [
    ...new Set(
      receipt.logs
        .filter((log) => log.topics?.[0] === roleGrantedTopic)
        .map((log) => log.address)
    ),
  ];

  if (tokenAddresses.length !== 1) {
    throw new Error(
      `Impossible d'identifier le CFDToken de la campagne. Adresses détectées : ${tokenAddresses.join(", ") || "aucune"}`
    );
  }

  return await ethers.getContractAt("CFDToken", tokenAddresses[0]);
}

async function expectRevert(promise, expectedError = "") {
  let reverted = false;
  try {
    const tx = await promise;
    if (tx && typeof tx.wait === "function") await tx.wait();
  } catch (err) {
    reverted = true;
    if (expectedError) {
      expect(err.message.toLowerCase()).to.include(expectedError.toLowerCase());
    }
  }
  expect(reverted, `La transaction aurait dû échouer (${expectedError})`).to.equal(true);
}

describe("02_Governance - Tests unitaires et anti-manipulation Snapshot (M3)", function () {
  let crowdfunding, governance, multiSig;
  let admin, sig2, sig3, creator, voter1, voter2, attacker;

  beforeEach(async function () {
    [admin, sig2, sig3, creator, voter1, voter2, attacker] = await ethers.getSigners();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
    crowdfunding = await Crowdfunding.deploy(admin.address);
    await crowdfunding.waitForDeployment();

    const Governance = await ethers.getContractFactory("Governance");
    governance = await Governance.deploy(
      admin.address,
      await crowdfunding.getAddress()
    );
    await governance.waitForDeployment();

    const MultiSig = await ethers.getContractFactory("MultiSig");
    multiSig = await MultiSig.deploy([
      admin.address,
      sig2.address,
      sig3.address,
    ]);
    await multiSig.waitForDeployment();

    // Les adresses sont enregistrées dans Crowdfunding par l'administrateur.
    await crowdfunding.connect(admin).setGovernance(await governance.getAddress());
    await crowdfunding.connect(admin).setMultiSig(await multiSig.getAddress());
  });

  it("M3.1 - Crée une campagne, distribue des CFD et ouvre une proposition", async function () {
    const cfdToken = await createCampaignAndGetToken(
      crowdfunding,
      creator,
      ethers.parseEther("10"),
      7 * 24 * 3600,
      creator.address,
      "QmGovCampaign1"
    );

    await crowdfunding.connect(voter1).contribute(1, {
      value: ethers.parseEther("3"),
    });
    await crowdfunding.connect(voter2).contribute(1, {
      value: ethers.parseEther("2"),
    });

    // ERC20Votes : chaque électeur délègue explicitement ses voix à lui-même.
    // Ces délégations sont minées avant la création du snapshot.
    await cfdToken.connect(voter1).delegate(voter1.address);
    await cfdToken.connect(voter2).delegate(voter2.address);

    // Freeze = 1 : action valide sur une campagne active non gelée.
    await governance.connect(voter1).createProposal(
      1,
      ProposalType.Freeze
    );

    await governance.connect(voter1).vote(1, true);
    await governance.connect(voter2).vote(1, true);
  });

  it(
  "M3.2 - Empêche le double vote et l'acquisition de pouvoir après le snapshot",
  async function () {
    const cfdToken = await createCampaignAndGetToken(
      crowdfunding,
      creator,
      ethers.parseEther("10"),
      7 * 24 * 3600,
      creator.address,
      "QmSnapshotSecurity"
    );

    await crowdfunding.connect(voter1).contribute(1, {
      value: ethers.parseEther("4"),
    });

    const voter1Balance = await cfdToken.balanceOf(voter1.address);
    expect(voter1Balance).to.be.greaterThan(0n);

    // La délégation est enregistrée avant que Governance capture le snapshot.
    await cfdToken.connect(voter1).delegate(voter1.address);

    await governance.connect(voter1).createProposal(
      1,
      ProposalType.Freeze
    );

    // Le vote de voter1 est enregistré avec son poids au snapshot.
await governance.connect(voter1).vote(1, true);

// Une même adresse ne peut pas voter deux fois.
// On vérifie le revert sans dépendre du message
// retourné par le provider Hardhat.
await expectRevert(
  governance.connect(voter1).vote(1, false)
);

    // L'attaquant reçoit les CFD après la création de la proposition.
    await cfdToken.connect(voter1).transfer(attacker.address, voter1Balance);

    // Les jetons reçus après le snapshot ne doivent pas donner de poids de vote.
    await expectRevert(governance.connect(attacker).vote(1, false));
  });

  it("M3.3 - Interdit l'exécution d'une proposition avant la fin du vote", async function () {
    const cfdToken = await createCampaignAndGetToken(
      crowdfunding,
      creator,
      ethers.parseEther("5"),
      7 * 24 * 3600,
      creator.address,
      "QmDelayCheck"
    );

    await crowdfunding.connect(voter1).contribute(1, {
      value: ethers.parseEther("5"),
    });

    await cfdToken.connect(voter1).delegate(voter1.address);

    await governance.connect(voter1).createProposal(
      1,
      ProposalType.Freeze
    );
    await governance.connect(voter1).vote(1, true);

    await expectRevert(governance.connect(voter1).executeProposal(1));
    // Après les 3 jours de vote, le délai supplémentaire
    // d'une journée n'est pas encore écoulé.
    await ethers.provider.send(
      "evm_increaseTime",
      [3 * 24 * 60 * 60]
    );

    await ethers.provider.send("evm_mine", []);

    await expectRevert(
      governance.connect(voter1).executeProposal(1),
      "Execution delay not elapsed"
    );

    // Après le délai supplémentaire d'un jour,
    // l'exécution devient possible.
    await ethers.provider.send(
      "evm_increaseTime",
      [24 * 60 * 60]
    );

    await ethers.provider.send("evm_mine", []);

    await (
      await governance.connect(voter1).executeProposal(1)
    ).wait();

    expect(
    await governance.getProposalState(1)
    ).to.equal(3);
  });
});

