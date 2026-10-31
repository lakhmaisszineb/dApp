// Tests de la Phase 1 (J1) : valident l'ENVIRONNEMENT, pas la logique métier.
// Fichier à supprimer en J2 avec contracts/mocks/EnvCheck.sol.
import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.getOrCreate();

describe("J1 — environnement Hardhat + OpenZeppelin", () => {
  let admin, alice, bob, attacker, envCheck;

  beforeEach(async () => {
    [admin, alice, bob, attacker] = await ethers.getSigners();
    envCheck = await ethers.deployContract("EnvCheck", [admin.address]);
  });

  it("fournit assez de comptes pour Alice/Bob/Charlie + 3 signataires multisig + admin", async () => {
    const signers = await ethers.getSigners();
    expect(signers.length).to.be.gte(7);
  });

  it("AccessControl : seul MINTER_ROLE peut mint (contrôle d'accès)", async () => {
    await expect(envCheck.connect(attacker).mint(attacker.address, 1n))
      .to.be.revertedWithCustomError(envCheck, "AccessControlUnauthorizedAccount");
  });

  it("Pausable : la pause d'urgence bloque mint (circuit breaker)", async () => {
    await envCheck.pause();
    await expect(envCheck.mint(alice.address, 1n))
      .to.be.revertedWithCustomError(envCheck, "EnforcedPause");
    await envCheck.unpause();
    await envCheck.mint(alice.address, 1n);
    expect(await envCheck.balanceOf(alice.address)).to.equal(1n);
  });

  it("ERC20Votes : le pouvoir de vote est figé au bloc du snapshot (anti prise de contrôle éclair)", async () => {
    await envCheck.mint(bob.address, 100n);
    const snapshotBlock = await ethers.provider.getBlockNumber(); // « création du vote »
    await networkHelpers.mine(1);

    // Après le snapshot, Bob envoie tout à l'attaquant qui se délègue le pouvoir.
    await envCheck.connect(bob).transfer(attacker.address, 100n);
    await envCheck.connect(attacker).delegate(attacker.address);
    await networkHelpers.mine(1);

    expect(await envCheck.getVotes(attacker.address)).to.equal(100n);          // pouvoir actuel
    expect(await envCheck.getPastVotes(attacker.address, snapshotBlock)).to.equal(0n); // pouvoir au snapshot
    expect(await envCheck.getPastVotes(bob.address, snapshotBlock)).to.equal(100n);
  });
});
