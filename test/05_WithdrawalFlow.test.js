
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// Valeurs de l'enum ProposalType de Governance.sol.
const ProposalType = Object.freeze({
  Withdrawal: 0,
  Freeze: 1,
  Unfreeze: 2,
  Cancel: 3,
});

const DAY = 24 * 60 * 60;
const CAMPAIGN_DURATION = 7 * DAY;

/**
 * Vérifie qu'une transaction échoue.
 */
async function expectRevert(promise, expectedError = "") {
  let reverted = false;

  try {
    const tx = await promise;
    if (tx && typeof tx.wait === "function") {
      await tx.wait();
    }
  } catch (err) {
    reverted = true;

    if (expectedError) {
      expect(err.message.toLowerCase()).to.include(
        expectedError.toLowerCase()
      );
    }
  }

  expect(
    reverted,
    `La transaction aurait dû échouer (${expectedError})`
  ).to.equal(true);
}

/**
 * Crée une campagne et récupère son CFDToken
 * à partir de l'événement RoleGranted.
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

  const roleGrantedTopic =
    CFDToken.interface.getEvent("RoleGranted").topicHash;

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
      `Impossible d'identifier le CFDToken : ${
        tokenAddresses.join(", ") || "aucune adresse détectée"
      }`
    );
  }

  return await ethers.getContractAt(
    "CFDToken",
    tokenAddresses[0]
  );
}

describe("05_WithdrawalFlow - Retrait complet et Circuit Breaker", function () {

  let crowdfunding;
  let governance;
  let multiSig;

  let admin;
  let sig2;
  let sig3;
  let creator;
  let beneficiary;

  beforeEach(async function () {

    [admin, sig2, sig3, creator, beneficiary] =
      await ethers.getSigners();

    // 1. Déploiement du contrat Crowdfunding.
    const Crowdfunding =
      await ethers.getContractFactory("Crowdfunding");

    crowdfunding = await Crowdfunding.deploy(admin.address);
    await crowdfunding.waitForDeployment();

    // 2. Déploiement de Governance.
    const Governance =
      await ethers.getContractFactory("Governance");

    governance = await Governance.deploy(
      admin.address,
      await crowdfunding.getAddress()
    );

    await governance.waitForDeployment();

    // 3. Déploiement du MultiSig avec trois signataires.
    const MultiSig =
      await ethers.getContractFactory("MultiSig");

    multiSig = await MultiSig.deploy([
      admin.address,
      sig2.address,
      sig3.address,
    ]);

    await multiSig.waitForDeployment();

    // 4. Configuration des adresses dans Crowdfunding.
    await crowdfunding.connect(admin).setGovernance(
      await governance.getAddress()
    );

    await crowdfunding.connect(admin).setMultiSig(
      await multiSig.getAddress()
    );
  });

  /**
   * Prépare une campagne réussie et obtient
   * l'autorisation effective de la gouvernance.
   *
   * Le bénéficiaire est également le contributeur :
   * il possède donc les CFD nécessaires pour voter.
   */
  async function prepareApprovedWithdrawal(amount, ipfsHash) {

    const token = await createCampaignAndGetToken(
      crowdfunding,
      creator,
      amount,
      CAMPAIGN_DURATION,
      beneficiary.address,
      ipfsHash
    );

    // Le bénéficiaire contribue et atteint l'objectif.
    await crowdfunding.connect(beneficiary).contribute(1, {
      value: amount,
    });

    // Le bénéficiaire demande le retrait.
    await crowdfunding.connect(beneficiary).requestWithdrawal(1);

    // Consultation des montants figés par requestWithdrawal.
    const [
      grossAmount,
      feeAmount,
      netAmount,
      needsMultiSig,
    ] = await crowdfunding.previewWithdrawal(1);

    expect(grossAmount).to.equal(amount);

    // Délégation des voix avant la création du snapshot.
    await token.connect(beneficiary).delegate(
      beneficiary.address
    );

    // Création de la proposition Withdrawal.
    await governance.connect(beneficiary).createProposal(
      1,
      ProposalType.Withdrawal
    );

    // Vote favorable.
    await governance.connect(beneficiary).vote(1, true);

    // Fin de la période de vote : 3 jours.
    await ethers.provider.send("evm_increaseTime", [3 * DAY]);
    await ethers.provider.send("evm_mine", []);

    // Délai supplémentaire avant exécution : 1 jour.
    await ethers.provider.send("evm_increaseTime", [DAY + 2]);
    await ethers.provider.send("evm_mine", []);

    // Exécution effective de la proposition.
    await governance.connect(beneficiary).executeProposal(1);

    // Vérification de l'autorisation transmise à Crowdfunding.
    const request = await crowdfunding.withdrawals(1);

    expect(request.requested).to.equal(true);
    expect(request.governanceApproved).to.equal(true);

    return {
      token,
      grossAmount,
      feeAmount,
      netAmount,
      needsMultiSig,
    };
  }

  // =========================================================
  // TEST 1 : PAUSE D'URGENCE ET BLOCAGE DES RETRAITS
  // =========================================================

  it(
    "SEC-4 - Bloque withdrawFunds pendant la pause d'urgence",
    async function () {

      // 0,4 ETH : montant inférieur au seuil multisig de 0,5 ETH.
      const amount = ethers.parseEther("0.4");

      const result = await prepareApprovedWithdrawal(
        amount,
        "QmWithdrawalPauseTest"
      );

      // Vérifie que le retrait ne nécessite pas de multisig.
      expect(result.needsMultiSig).to.equal(false);

      // À ce stade, la demande et l'autorisation de gouvernance
      // sont déjà présentes.
      const request = await crowdfunding.withdrawals(1);

      expect(request.requested).to.equal(true);
      expect(request.governanceApproved).to.equal(true);

      const crowdfundingAddress =
        await crowdfunding.getAddress();

      const balanceBefore = await ethers.provider.getBalance(
        crowdfundingAddress
      );

      // Activation du circuit breaker.
      await crowdfunding.connect(admin).pause();

      expect(await crowdfunding.paused()).to.equal(true);

      // Le retrait doit être rejeté uniquement à cause de la pause.
      await expectRevert(
        crowdfunding.connect(beneficiary).withdrawFunds(1)
      );

      // Les fonds doivent rester dans le contrat.
      const balanceDuringPause =
        await ethers.provider.getBalance(crowdfundingAddress);

      expect(balanceDuringPause).to.equal(balanceBefore);

      // Désactivation de la pause.
      await crowdfunding.connect(admin).unpause();

      expect(await crowdfunding.paused()).to.equal(false);

      // Après la reprise, le retrait doit pouvoir aboutir.
      await crowdfunding.connect(beneficiary).withdrawFunds(1);

      // Les frais restent dans Crowdfunding après le paiement net.
      expect(
        await ethers.provider.getBalance(crowdfundingAddress)
      ).to.equal(result.feeAmount);

      expect(await crowdfunding.accruedFees()).to.equal(
        result.feeAmount
      );
    }
  );

  // =========================================================
  // TEST 2 : PARCOURS COMPLET DU RETRAIT
  // GOVERNANCE + MULTISIG 2/3 + TRANSFERT ETH
  // =========================================================

  it(
    "M2/M3 - Exécute un retrait après validation Governance et MultiSig 2/3",
    async function () {

      // 1 ETH dépasse le seuil multisig de 0,5 ETH.
      const amount = ethers.parseEther("1");

      const result = await prepareApprovedWithdrawal(
        amount,
        "QmCompleteWithdrawalTest"
      );

      const {
        grossAmount,
        feeAmount,
        netAmount,
        needsMultiSig,
      } = result;

      expect(needsMultiSig).to.equal(true);

      // La gouvernance a approuvé, mais le multisig n'a pas encore validé.
      const requestBeforeMultiSig =
        await crowdfunding.withdrawals(1);

      expect(requestBeforeMultiSig.governanceApproved).to.equal(true);
      expect(requestBeforeMultiSig.multisigApproved).to.equal(false);

      // Le bénéficiaire ne doit pas pouvoir retirer les fonds
      // sans la validation multisignature supplémentaire.
      await expectRevert(
        crowdfunding.connect(beneficiary).withdrawFunds(1)
      );

      // ---------------------------------------------
      // Étape 1 : Préparation de la transaction MultiSig
      // ---------------------------------------------

      const crowdfundingAddress =
        await crowdfunding.getAddress();

      // Encodage de approveWithdrawalMultiSig(1).
      const callData =
        crowdfunding.interface.encodeFunctionData(
          "approveWithdrawalMultiSig",
          [1]
        );

      // Récupération de l'identifiant avant l'envoi réel.
      const txId = await multiSig.connect(admin)
        .submitTransaction.staticCall(
          crowdfundingAddress,
          0n,
          callData
        );

      await multiSig.connect(admin).submitTransaction(
        crowdfundingAddress,
        0n,
        callData
      );

      // Le premier signataire peut être automatiquement confirmé
      // lors de la soumission.
      if (!(await multiSig.isConfirmed(txId, admin.address))) {
        await multiSig.connect(admin).confirmTransaction(txId);
      }

      // Une seule confirmation ne suffit pas.
      await expectRevert(
        multiSig.connect(admin).executeTransaction(txId)
      );

      // ---------------------------------------------
      // Étape 2 : Deuxième confirmation
      // ---------------------------------------------

      await multiSig.connect(sig2).confirmTransaction(txId);

      // ---------------------------------------------
      // Étape 3 : Exécution par le contrat MultiSig
      // ---------------------------------------------

      await multiSig.connect(admin).executeTransaction(txId);

      // Le callback du MultiSig a maintenant été accepté
      // par Crowdfunding.
      const requestAfterMultiSig =
        await crowdfunding.withdrawals(1);

      expect(requestAfterMultiSig.multisigApproved).to.equal(true);

      // ---------------------------------------------
      // Étape 4 : Paiement du bénéficiaire
      // ---------------------------------------------

      const beneficiaryBalanceBefore =
        await ethers.provider.getBalance(beneficiary.address);

      const withdrawTx = await crowdfunding
        .connect(beneficiary)
        .withdrawFunds(1);

      const receipt = await withdrawTx.wait();

      const beneficiaryBalanceAfter =
        await ethers.provider.getBalance(beneficiary.address);

      // Compensation du coût de gas pour isoler le montant ETH reçu.
      expect(
        beneficiaryBalanceAfter +
        receipt.fee -
        beneficiaryBalanceBefore
      ).to.equal(netAmount);

      // ---------------------------------------------
      // Étape 5 : Vérification comptable finale
      // ---------------------------------------------

      // Le montant brut est composé du montant net payé
      // et des frais conservés par le contrat.
      expect(grossAmount).to.equal(netAmount + feeAmount);

      expect(
        await crowdfunding.accruedFees()
      ).to.equal(feeAmount);

      // Le solde restant dans Crowdfunding correspond aux frais.
      expect(
        await ethers.provider.getBalance(crowdfundingAddress)
      ).to.equal(feeAmount);
    }
  );

});
