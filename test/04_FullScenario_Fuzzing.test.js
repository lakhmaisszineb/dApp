import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

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

describe("04_FullScenario_Fuzzing - Test d'intégration et invariant ETH/CFD", function () {
  let crowdfunding, cfdToken;
  let admin, creator, c1, c2, c3;

  beforeEach(async function () {
    [admin, creator, c1, c2, c3] = await ethers.getSigners();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
    crowdfunding = await Crowdfunding.deploy(admin.address);
    await crowdfunding.waitForDeployment();

    cfdToken = await createCampaignAndGetToken(
      crowdfunding,
      creator,
      ethers.parseEther("1000"),
      30 * 24 * 3600,
      creator.address,
      "QmFuzzingCampaignIpfs"
    );
  });

  it("Fuzzing - Préserve l'invariant solde ETH du contrat = somme des contributions", async function () {
    const contributors = [c1, c2, c3];
    let totalExpectedWei = 0n;

    for (let i = 1; i <= 30; i++) {
      // Valeur pseudo-aléatoire déterministe comprise entre 0,005 et 1,750 ETH.
      const pseudoRandomFinney = BigInt(((i * 137 + 29) % 1746) + 5);
      const amountWei = pseudoRandomFinney * 10n ** 15n;
      const user = contributors[i % contributors.length];

      await crowdfunding.connect(user).contribute(1, {
        value: amountWei,
      });
      totalExpectedWei += amountWei;
    }

    const contractBalance = await ethers.provider.getBalance(
      await crowdfunding.getAddress()
    );
    expect(contractBalance).to.equal(totalExpectedWei);

    const totalCFD =
      (await cfdToken.balanceOf(c1.address)) +
      (await cfdToken.balanceOf(c2.address)) +
      (await cfdToken.balanceOf(c3.address));

    expect(totalCFD).to.be.greaterThan(0n);
    expect(await cfdToken.totalSupply()).to.equal(totalCFD);
  });
});
