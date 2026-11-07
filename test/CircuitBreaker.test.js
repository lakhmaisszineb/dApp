import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();
const { time } = networkHelpers;

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

describe("CircuitBreaker & Anti-Réentrance - Tests de sécurité", function () {
  let crowdfunding;
  let admin, creator, contributor, attackerEOA;

  beforeEach(async function () {
    [admin, creator, contributor, attackerEOA] = await ethers.getSigners();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
    crowdfunding = await Crowdfunding.deploy(admin.address);
    await crowdfunding.waitForDeployment();
  });

  it("Sécurité 1 - Seul l'administrateur peut activer ou désactiver le Circuit Breaker", async function () {
    await expectRevert(crowdfunding.connect(attackerEOA).pause());

    await crowdfunding.connect(admin).pause();

    await expectRevert(crowdfunding.connect(attackerEOA).unpause());
    await crowdfunding.connect(admin).unpause();
  });

  it("Sécurité 2 - Bloque les contributions pendant la mise en pause", async function () {
    await crowdfunding.connect(creator).createCampaign(
      ethers.parseEther("5"),
      7 * 24 * 3600,
      creator.address,
      "QmCircuitBreakerTest"
    );

    await crowdfunding.connect(admin).pause();

    await expectRevert(
      crowdfunding.connect(contributor).contribute(1, {
        value: ethers.parseEther("1"),
      })
    );

    await crowdfunding.connect(admin).unpause();
    await crowdfunding.connect(contributor).contribute(1, {
      value: ethers.parseEther("1"),
    });

    const contractBalance = await ethers.provider.getBalance(
      await crowdfunding.getAddress()
    );
    expect(contractBalance).to.equal(ethers.parseEther("1"));
  });

  it("Sécurité 3 - Bloque une attaque par réentrance via ReentrantAttacker", async function () {
    const duration = 7 * 24 * 3600; // MIN_DURATION = 1 jour

    await crowdfunding.connect(creator).createCampaign(
      ethers.parseEther("10"),
      duration,
      creator.address,
      "QmReentrancyTarget"
    );

    await crowdfunding.connect(contributor).contribute(1, {
      value: ethers.parseEther("4"),
    });

    const ReentrantAttacker = await ethers.getContractFactory("ReentrantAttacker");
    const attackerContract = await ReentrantAttacker.deploy(
      await crowdfunding.getAddress()
    );
    await attackerContract.waitForDeployment();

    await attackerContract.contributeToTarget(1, {
      value: ethers.parseEther("1"),
    });

    await time.increase(duration + 60);

    await expectRevert(attackerContract.launchRefundAttack(1));

    // La transaction d'attaque ayant revert, aucun ETH n'a été retiré.
    const remainingBalance = await ethers.provider.getBalance(
      await crowdfunding.getAddress()
    );
    expect(remainingBalance).to.equal(ethers.parseEther("5"));
  });
});
