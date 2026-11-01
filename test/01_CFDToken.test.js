import { expect } from "chai";
import { network } from "hardhat";

// Même méthode de connexion que dans vos tests existants.
const { ethers } = await network.getOrCreate();

describe("J2 - CFDToken", function () {
  let admin;
  let minter;
  let fz;
  let sara;
  let outsider;

  let tokenA;
  let tokenB;

  // Conversion d'un nombre de CFD vers ses unités entières.
  const cfd = (amount) => ethers.parseUnits(amount, 18);

  beforeEach(async function () {
    [admin, minter, fz, sara, outsider] =
      await ethers.getSigners();

    // Le même modèle est déployé pour la campagne 1.
    tokenA = await ethers.deployContract("CFDToken", [
      "CFD Campagne 1",
      "CFD-1",
      1n,
      admin.address,
      minter.address,
    ]);

    await tokenA.waitForDeployment();

    // Une deuxième instance indépendante pour la campagne 2.
    tokenB = await ethers.deployContract("CFDToken", [
      "CFD Campagne 2",
      "CFD-2",
      2n,
      admin.address,
      minter.address,
    ]);

    await tokenB.waitForDeployment();
  });

  it("enregistre les paramètres de la campagne", async function () {
    expect(await tokenA.name()).to.equal("CFD Campagne 1");
    expect(await tokenA.symbol()).to.equal("CFD-1");
    expect(await tokenA.decimals()).to.equal(18n);
    expect(await tokenA.campaignId()).to.equal(1n);
  });

  it("ne crée aucun jeton au déploiement", async function () {
    expect(await tokenA.totalSupply()).to.equal(0n);
    expect(await tokenB.totalSupply()).to.equal(0n);
  });

  it("attribue les rôles aux adresses prévues", async function () {
    const adminRole = await tokenA.DEFAULT_ADMIN_ROLE();
    const minterRole = await tokenA.MINTER_ROLE();

    expect(
      await tokenA.hasRole(adminRole, admin.address)
    ).to.equal(true);

    expect(
      await tokenA.hasRole(minterRole, minter.address)
    ).to.equal(true);

    // Être administrateur ne donne pas automatiquement
    // le rôle de minter.
    expect(
      await tokenA.hasRole(minterRole, admin.address)
    ).to.equal(false);
  });

  it("refuse la création de jetons sans autorisation", async function () {
    const minterRole = await tokenA.MINTER_ROLE();

    await expect(
      tokenA.connect(outsider).mint(fz.address, cfd("100"))
    )
      .to.be.revertedWithCustomError(
        tokenA,
        "AccessControlUnauthorizedAccount"
      )
      .withArgs(outsider.address, minterRole);
  });

  it("refuse une quantité nulle", async function () {
    await expect(
      tokenA.connect(minter).mint(fz.address, 0n)
    ).to.be.revertedWithCustomError(
      tokenA,
      "ZeroMintAmount"
    );
  });

  it("refuse un destinataire nul", async function () {
    await expect(
      tokenA.connect(minter).mint(ethers.ZeroAddress, cfd("1"))
    )
      .to.be.revertedWithCustomError(
        tokenA,
        "ERC20InvalidReceiver"
      )
      .withArgs(ethers.ZeroAddress);
  });

  it("active automatiquement les voix après mint", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    expect(await tokenA.balanceOf(fz.address))
      .to.equal(cfd("100"));

    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("100"));

    expect(await tokenA.delegates(fz.address))
      .to.equal(fz.address);
  });

  it("sépare les droits entre les campagnes", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    // FZ possède des voix dans A.
    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("100"));

    // Ces mêmes jetons ne donnent aucune voix dans B.
    expect(await tokenB.balanceOf(fz.address))
      .to.equal(0n);

    expect(await tokenB.getVotes(fz.address))
      .to.equal(0n);
  });

  it("transfère les jetons et les voix de la bonne campagne", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    await (
      await tokenB.connect(minter).mint(fz.address, cfd("40"))
    ).wait();

    await (
      await tokenA.connect(fz).transfer(sara.address, cfd("30"))
    ).wait();

    // Campagne A : FZ garde 70, Sara reçoit 30.
    expect(await tokenA.balanceOf(fz.address))
      .to.equal(cfd("70"));

    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("70"));

    expect(await tokenA.balanceOf(sara.address))
      .to.equal(cfd("30"));

    expect(await tokenA.getVotes(sara.address))
      .to.equal(cfd("30"));

    // Campagne B : aucun changement.
    expect(await tokenB.getVotes(fz.address))
      .to.equal(cfd("40"));

    expect(await tokenB.getVotes(sara.address))
      .to.equal(0n);
  });

  it("conserve les voix historiques après un transfert", async function () {
    const mintTx = await tokenA
      .connect(minter)
      .mint(fz.address, cfd("100"));

    const mintReceipt = await mintTx.wait();

    // Pour ce test, on examine l'état à la fin du bloc du mint.
    const snapshotBlock = mintReceipt.blockNumber;

    // Cette transaction avance aussi la blockchain :
    // le bloc du snapshot devient un bloc passé.
    await (
      await tokenA.connect(fz).transfer(sara.address, cfd("30"))
    ).wait();

    // Aujourd'hui : FZ a 70 voix et Sara 30.
    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("70"));

    expect(await tokenA.getVotes(sara.address))
      .to.equal(cfd("30"));

    // Au snapshot : FZ avait 100 et Sara n'avait rien.
    expect(
      await tokenA.getPastVotes(fz.address, snapshotBlock)
    ).to.equal(cfd("100"));

    expect(
      await tokenA.getPastVotes(sara.address, snapshotBlock)
    ).to.equal(0n);

    expect(
      await tokenA.getPastTotalSupply(snapshotBlock)
    ).to.equal(cfd("100"));
  });

  it("interdit la délégation des voix à une autre adresse", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    await expect(
      tokenA.connect(fz).delegate(sara.address)
    ).to.be.revertedWithCustomError(
      tokenA,
      "ExternalDelegationDisabled"
    );

    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("100"));

    expect(await tokenA.getVotes(sara.address))
      .to.equal(0n);
  });

  it("refuse un administrateur ou un minter nul", async function () {
    await expect(
      ethers.deployContract("CFDToken", [
        "CFD Campagne 3",
        "CFD-3",
        3n,
        ethers.ZeroAddress,
        minter.address,
      ])
    ).to.be.revertedWithCustomError(tokenA, "InvalidAddress");

    await expect(
      ethers.deployContract("CFDToken", [
        "CFD Campagne 3",
        "CFD-3",
        3n,
        admin.address,
        ethers.ZeroAddress,
      ])
    ).to.be.revertedWithCustomError(tokenA, "InvalidAddress");
  });
});