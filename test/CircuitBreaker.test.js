
import assert from "node:assert/strict";
import hre from "hardhat";

// ==========================================================
// TIWIZI - TESTS DU CIRCUIT BREAKER
// Hardhat 3 + ethers.js v6 + Mocha
// ==========================================================

const DAY = 24 * 60 * 60;
const GOAL = 2n * 10n ** 18n;   // 2 ETH
const SMALL = 10n ** 17n;       // 0.1 ETH

// Avancer le temps sur la blockchain locale
async function advance(ethers, seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

// Recuperer le timestamp d'une transaction
async function timestampOf(ethers, tx) {
  const receipt = await tx.wait();
  const block = await ethers.provider.getBlock(
    receipt.blockNumber
  );
  return BigInt(block.timestamp);
}

// Verifier qu'une transaction est refusee
async function mustRevert(action, reason) {
  let thrown;

  try {
    const tx = await action();
    if (tx?.wait) {
      await tx.wait();
    }
  } catch (error) {
    thrown = error;
  }

  assert.ok(
    thrown,
    `La transaction aurait du etre refusee : ${reason}`
  );

  assert.ok(
    String(thrown).includes(reason),
    `Erreur attendue : ${reason}\nErreur reelle : ${String(thrown)}`
  );
}

// ==========================================================
// SUITE DES TESTS
// ==========================================================

describe("TIWIZI - Circuit Breaker", function () {

  let ethers;
  let admin;
  let alice;
  let bob;
  let beneficiary;
  let crowdfunding;

  // --------------------------------------------------------
  // PREPARATION AVANT CHAQUE TEST
  // --------------------------------------------------------

  beforeEach(async function () {

    ({ ethers } = await hre.network.connect());

    [admin, alice, bob, beneficiary] =
      await ethers.getSigners();

    const Factory =
      await ethers.getContractFactory("Crowdfunding");

    crowdfunding =
      await Factory.deploy(admin.address);

    await crowdfunding.waitForDeployment();

  });

  // Creer une campagne pour les tests
  async function campaign(
    duration = 5 * DAY,
    goal = GOAL,
    creator = alice
  ) {

    await (
      await crowdfunding.connect(creator).createCampaign(
        goal,
        duration,
        beneficiary.address,
        "ipfs://tiwizi-test"
      )
    ).wait();

    return await crowdfunding.campaignCount();
  }

  // ========================================================
  // TEST 1 - CONTROLE DU ROLE ADMIN
  // ========================================================

  it("1 - Refuse la pause a un utilisateur normal",
    async function () {

      await mustRevert(
        () => crowdfunding.connect(alice).pause(),
        "AccessControlUnauthorizedAccount"
      );

    }
  );

  // ========================================================
  // TEST 2 - ACTIVATION ET TRACABILITE
  // ========================================================

  it("2 - Autorise l'Admin a activer la pause",
    async function () {

      const tx =
        await crowdfunding.connect(admin).pause();

      const start = await timestampOf(ethers, tx);

      assert.equal(
        await crowdfunding.paused(),
        true
      );

      assert.equal(
        await crowdfunding.emergencyPauseActive(),
        true
      );

      assert.equal(
        await crowdfunding.pauseStartedAt(),
        start
      );

      assert.equal(
        await crowdfunding.pauseExpiresAt(),
        start + BigInt(DAY)
      );

      // Verifier l'evenement blockchain
      const receipt = await tx.wait();

      const log = receipt.logs
        .map((l) => {
          try {
            return crowdfunding.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find(
          (l) => l?.name === "EmergencyPauseStarted"
        );

      assert.ok(
        log,
        "Evenement EmergencyPauseStarted manquant"
      );

    }
  );

  // ========================================================
  // TEST 3 - CONTRIBUTIONS BLOQUEES
  // ========================================================

  it("3 - Bloque les contributions pendant la pause",
    async function () {

      const id = await campaign();

      await (await crowdfunding.pause()).wait();

      await mustRevert(
        () => crowdfunding.connect(bob).contribute(
          id,
          { value: SMALL }
        ),
        "EnforcedPause"
      );

    }
  );

  // ========================================================
  // TEST 4 - DEMANDES DE RETRAIT BLOQUEES
  // ========================================================

  it("4 - Bloque les demandes de retrait pendant la pause",
    async function () {

      const id = await campaign(5 * DAY, SMALL);

      await (
        await crowdfunding.connect(bob).contribute(
          id,
          { value: SMALL }
        )
      ).wait();

      await (await crowdfunding.pause()).wait();

      await mustRevert(
        () => crowdfunding
          .connect(beneficiary)
          .requestWithdrawal(id),
        "EnforcedPause"
      );

    }
  );

  // ========================================================
  // TEST 5 - REPRISE ANTICIPEE PAR ADMIN
  // ========================================================

  it("5 - Permet la reprise avant 24 heures",
    async function () {

      await (await crowdfunding.pause()).wait();

      // Simuler trois heures de pause
      await advance(ethers, 3 * 60 * 60);

      const before =
        await crowdfunding.totalPausedSeconds();

      const tx = await crowdfunding.unpause();

      await tx.wait();

      const after =
        await crowdfunding.totalPausedSeconds();

      assert.equal(
        await crowdfunding.paused(),
        false
      );

      // La duree compensee doit etre environ 3 heures
      assert.ok(
        after - before >= 3n * 60n * 60n
      );

      assert.ok(
        after - before <= 3n * 60n * 60n + 10n
      );

    }
  );

  // ========================================================
  // TEST 6 - EXPIRATION APRES 24 HEURES
  // ========================================================

  it("6 - Permet a tous de terminer une pause expiree",
    async function () {

      await (await crowdfunding.pause()).wait();

      // Avancer de 24 heures et une minute
      await advance(ethers, DAY + 60);

      assert.equal(
        await crowdfunding.emergencyPauseActive(),
        false
      );

      // Alice n'est pas Admin, mais peut clore
      // une pause ayant atteint sa limite.
      await (
        await crowdfunding
          .connect(alice)
          .expirePause()
      ).wait();

      assert.equal(
        await crowdfunding.paused(),
        false
      );

      assert.equal(
        await crowdfunding.totalPausedSeconds(),
        BigInt(DAY)
      );

    }
  );

  // ========================================================
  // TEST 7 - REPRISE DES CONTRIBUTIONS
  // ========================================================

  it("7 - Autorise les contributions apres expiration",
    async function () {

      const id = await campaign(5 * DAY);

      await (await crowdfunding.pause()).wait();

      await advance(ethers, DAY + 60);

      // Le modifier whenOperational clot automatiquement
      // la pause expiree au debut de la transaction.
      await (
        await crowdfunding.connect(bob).contribute(
          id,
          { value: SMALL }
        )
      ).wait();

      assert.equal(
        await crowdfunding.paused(),
        false
      );

      const c = await crowdfunding.campaigns(id);

      assert.equal(
        c.totalRaised,
        SMALL
      );

    }
  );

  // ========================================================
  // TEST 8 - COMPENSATION DE 12 HEURES
  // ========================================================

  it("8 - Compense une pause de 12 heures",
    async function () {

      const id = await campaign(5 * DAY);

      const initial =
        await crowdfunding.effectiveDeadline(id);

      await (await crowdfunding.pause()).wait();

      // Simuler 12 heures
      await advance(ethers, 12 * 60 * 60);

      await (await crowdfunding.unpause()).wait();

      const updated =
        await crowdfunding.effectiveDeadline(id);

      const diff = updated - initial;

      assert.ok(
        diff >= 12n * 60n * 60n,
        `Compensation insuffisante : ${diff}`
      );

      assert.ok(
        diff <= 12n * 60n * 60n + 10n,
        `Compensation excessive : ${diff}`
      );

    }
  );

  // ========================================================
  // TEST 9 - PROTECTION CONTRE LES PAUSES REPETEES
  // ========================================================

  it("9 - Respecte le cooldown de 24 heures",
    async function () {

      await (await crowdfunding.pause()).wait();

      await advance(ethers, 60 * 60);

      await (await crowdfunding.unpause()).wait();

      // L'Admin ne peut pas suspendre immediatement
      await mustRevert(
        () => crowdfunding.pause(),
        "Pause cooldown active"
      );

      // Attendre la fin du cooldown
      await advance(ethers, DAY + 2);

      await (await crowdfunding.pause()).wait();

      assert.equal(
        await crowdfunding.emergencyPauseActive(),
        true
      );

    }
  );

  // ========================================================
  // TEST 10 - COMPENSATION DE PLUSIEURS PAUSES
  // ========================================================

  it("10 - Cumule correctement plusieurs pauses",
    async function () {

      const id = await campaign(10 * DAY);

      const firstDeadline =
        await crowdfunding.effectiveDeadline(id);

      // Premiere pause : 2 heures
      await (await crowdfunding.pause()).wait();

      await advance(ethers, 2 * 60 * 60);

      await (await crowdfunding.unpause()).wait();

      // Attendre la periode de cooldown
      await advance(ethers, DAY + 2);

      // Deuxieme pause : 3 heures
      await (await crowdfunding.pause()).wait();

      await advance(ethers, 3 * 60 * 60);

      await (await crowdfunding.unpause()).wait();

      const shift =
        (await crowdfunding.effectiveDeadline(id))
        - firstDeadline;

      assert.ok(
        shift >= 5n * 60n * 60n
      );

      assert.ok(
        shift <= 5n * 60n * 60n + 20n
      );

    }
  );

  // ========================================================
  // TEST 11 - REMBOURSEMENT PENDANT LA PAUSE
  // ========================================================

  it("11 - Autorise un remboursement legitime",
    async function () {

      // Campagne dont l'objectif ne sera pas atteint
      const id = await campaign(DAY, GOAL);

      await (
        await crowdfunding.connect(bob).contribute(
          id,
          { value: SMALL }
        )
      ).wait();

      // Faire arriver la campagne a echeance
      await advance(ethers, DAY + 60);

      await (
        await crowdfunding.finalizeCampaign(id)
      ).wait();

      // Activer la pause apres l'echec
      await (await crowdfunding.pause()).wait();

      // Le remboursement reste possible
      await (
        await crowdfunding.connect(bob).refund(id)
      ).wait();

      const c = await crowdfunding.campaigns(id);

      assert.equal(
        c.totalRefunded,
        SMALL
      );

    }
  );

  // ========================================================
  // TEST 12 - PROTECTION CONTRE FINALISATION PREMATUREE
  // ========================================================

  it("12 - Empeche de finaliser une campagne trop tot",
    async function () {

      const id = await campaign(2 * DAY);

      // Un jour de fonctionnement normal
      await advance(ethers, DAY);

      // Pause de 12 heures
      await (await crowdfunding.pause()).wait();

      await advance(ethers, 12 * 60 * 60);

      await (await crowdfunding.unpause()).wait();

      // Attendre encore une demi-journee
      await advance(ethers, DAY / 2);

      // L'horloge effective n'a pas encore
      // atteint la date limite.
      await mustRevert(
        () => crowdfunding.finalizeCampaign(id),
        "Campaign still running"
      );

      // Terminer le temps restant
      await advance(ethers, DAY / 2 + 2);

      await (
        await crowdfunding.finalizeCampaign(id)
      ).wait();

      const c = await crowdfunding.campaigns(id);

      // 2 = Failed
      assert.equal(
        c.status,
        2n
      );

    }
  );

});
