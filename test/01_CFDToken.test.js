import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

/**
 * Dans cette version du projet, Crowdfunding déploie un CFDToken propre
 * à chaque campagne. Le token est donc récupéré depuis les événements
 * RoleGranted émis par le contrat CFDToken pendant createCampaign().
 */
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

describe("01_CFDToken - Tests Unitaires (M1 : ERC-20, MINTER_ROLE)", function () {
  let crowdfunding;
  let cfdToken;
  let admin, contributor1, contributor2, attacker;

  beforeEach(async function () {
    [admin, contributor1, contributor2, attacker] = await ethers.getSigners();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
    crowdfunding = await Crowdfunding.deploy(admin.address);
    await crowdfunding.waitForDeployment();

    // Une campagne crée automatiquement son propre CFDToken.
    cfdToken = await createCampaignAndGetToken(
      crowdfunding,
      contributor1,
      ethers.parseEther("5"),
      7 * 24 * 3600,
      contributor1.address,
      "QmCidIpfsTestM1"
    );
  });

  it("M1.1 - Initialise correctement le nom, le symbole, les décimales et la supply", async function () {
    expect(await cfdToken.name()).to.be.a("string").and.not.to.equal("");
    expect(await cfdToken.symbol()).to.equal("CFD-1");
    expect(await cfdToken.name()).to.equal("CFD Campagne 1");
    expect(await cfdToken.decimals()).to.equal(18n);
    expect(await cfdToken.totalSupply()).to.equal(0n);
  });

  it("M1.2 - Attribue MINTER_ROLE au contrat Crowdfunding", async function () {
    const minterRole = await cfdToken.MINTER_ROLE();
    expect(
      await cfdToken.hasRole(minterRole, await crowdfunding.getAddress())
    ).to.equal(true);
  });

  it("M1.3 - Interdit le mint direct par un compte externe non autorisé", async function () {
    await expectRevert(
      cfdToken.connect(attacker).mint(attacker.address, ethers.parseEther("100"))
    );
  });

  it("M1.4 - Frappe automatiquement des CFD lors d'une contribution ETH", async function () {
    await crowdfunding.connect(contributor2).contribute(1, {
      value: ethers.parseEther("1"),
    });

    const cfdBalance = await cfdToken.balanceOf(contributor2.address);
    expect(cfdBalance).to.be.greaterThan(0n);
  });

  it("M1.5 - Autorise le transfert ERC-20 entre deux utilisateurs", async function () {
    await crowdfunding.connect(contributor1).contribute(1, {
      value: ethers.parseEther("1"),
    });

    const initialBalance = await cfdToken.balanceOf(contributor1.address);
    expect(initialBalance).to.be.greaterThan(0n);

    const amountToTransfer = initialBalance / 2n;
    await cfdToken.connect(contributor1).transfer(
      contributor2.address,
      amountToTransfer
    );

    expect(await cfdToken.balanceOf(contributor2.address)).to.equal(
      amountToTransfer
    );
  });
});
