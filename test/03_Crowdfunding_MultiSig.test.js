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

describe("03_Crowdfunding_MultiSig - Refund et MultiSig 2/3", function () {
  let crowdfunding, multiSig;
  let admin, sig2, sig3, creator, contributor1, outsider;

  beforeEach(async function () {
    [admin, sig2, sig3, creator, contributor1, outsider] = await ethers.getSigners();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
    crowdfunding = await Crowdfunding.deploy(admin.address);
    await crowdfunding.waitForDeployment();

    const MultiSig = await ethers.getContractFactory("MultiSig");
    multiSig = await MultiSig.deploy([
      admin.address,
      sig2.address,
      sig3.address,
    ]);
    await multiSig.waitForDeployment();

    await crowdfunding.connect(admin).setMultiSig(await multiSig.getAddress());
  });

  it("M2.1 - Autorise le refund uniquement après l'échec et la deadline", async function () {
    const goal = ethers.parseEther("10");
    const duration = 7 * 24 * 3600; // MIN_DURATION = 1 jour
    const contribution = ethers.parseEther("2");

    await crowdfunding.connect(creator).createCampaign(
      goal,
      duration,
      creator.address,
      "QmFailedCampaign"
    );

    await crowdfunding.connect(contributor1).contribute(1, {
      value: contribution,
    });

    // Un remboursement avant l'expiration de la campagne doit échouer.
    await expectRevert(crowdfunding.connect(contributor1).refund(1));

    await time.increase(duration + 60);

    const balanceBefore = await ethers.provider.getBalance(contributor1.address);
    const refundTx = await crowdfunding.connect(contributor1).refund(1);
    const receipt = await refundTx.wait();
    const gasCost = receipt.fee;
    const balanceAfter = await ethers.provider.getBalance(contributor1.address);

    expect(balanceAfter + gasCost - balanceBefore).to.equal(contribution);

    // Le même contributeur ne peut pas réclamer deux fois son remboursement.
    await expectRevert(crowdfunding.connect(contributor1).refund(1));
  });

  it("M2.2 - Exige deux confirmations sur trois et bloque les non-signataires", async function () {
    const destination = outsider.address;
    const value = 0n;
    const data = "0x";

    // staticCall permet de connaître l'identifiant retourné avant l'envoi réel.
    const txId = await multiSig.connect(admin).submitTransaction.staticCall(
      destination,
      value,
      data
    );
    await multiSig.connect(admin).submitTransaction(destination, value, data);

    await expectRevert(multiSig.connect(outsider).confirmTransaction(txId));

    // Certains multisig enregistrent automatiquement la confirmation de l'émetteur.
    // On vérifie donc l'état avant de tenter une confirmation supplémentaire.
    if (!(await multiSig.isConfirmed(txId, admin.address))) {
      await multiSig.connect(admin).confirmTransaction(txId);
    }

    // Une seule signature ne suffit pas pour exécuter la transaction.
    await expectRevert(multiSig.connect(admin).executeTransaction(txId));

    await multiSig.connect(sig2).confirmTransaction(txId);
    await multiSig.connect(admin).executeTransaction(txId);
  });
});
