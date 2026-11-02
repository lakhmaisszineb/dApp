import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

describe("J2 - CFDToken", function () {
  let admin, minter, fz, sara, outsider;
  let tokenA, tokenB;

  // Convertit un montant affiché en petites unités CFD.
  const cfd = (amount) => ethers.parseUnits(amount, 18);

  // Chaque test commence avec de nouvelles instances.
  beforeEach(async function () {
    [admin, minter, fz, sara, outsider] =
      await ethers.getSigners();

    tokenA = await ethers.deployContract("CFDToken", [
      "CFD Campagne 1",
      "CFD-1",
      1n,
      admin.address,
      minter.address,
    ]);
    await tokenA.waitForDeployment();

    tokenB = await ethers.deployContract("CFDToken", [
      "CFD Campagne 2",
      "CFD-2",
      2n,
      admin.address,
      minter.address,
    ]);
    await tokenB.waitForDeployment();
  });

  it("enregistre les paramètres de campagne", async function () {
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
    expect(
      await tokenA.hasRole(
        await tokenA.DEFAULT_ADMIN_ROLE(),
        admin.address
      )
    ).to.equal(true);

    expect(
      await tokenA.hasRole(
        await tokenA.MINTER_ROLE(),
        minter.address
      )
    ).to.equal(true);

    expect(
      await tokenA.hasRole(
        await tokenA.MINTER_ROLE(),
        admin.address
      )
    ).to.equal(false);
  });

  it("refuse la création sans autorisation", async function () {
    await expect(
      tokenA.connect(outsider).mint(fz.address, cfd("100"))
    )
      .to.be.revertedWithCustomError(
        tokenA,
        "AccessControlUnauthorizedAccount"
      )
      .withArgs(outsider.address, await tokenA.MINTER_ROLE());
  });

  it("refuse une création de zéro jeton", async function () {
    await expect(
      tokenA.connect(minter).mint(fz.address, 0n)
    ).to.be.revertedWithCustomError(tokenA, "ZeroMintAmount");
  });

  it("refuse une création vers l'adresse nulle", async function () {
    await expect(
      tokenA.connect(minter).mint(ethers.ZeroAddress, 1n)
    )
      .to.be.revertedWithCustomError(
        tokenA,
        "ERC20InvalidReceiver"
      )
      .withArgs(ethers.ZeroAddress);
  });

  it("crée les CFD et active automatiquement les voix", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    expect(await tokenA.balanceOf(fz.address))
      .to.equal(cfd("100"));

    expect(await tokenA.totalSupply())
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

    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("100"));

    expect(await tokenB.balanceOf(fz.address)).to.equal(0n);
    expect(await tokenB.getVotes(fz.address)).to.equal(0n);
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

    expect(await tokenA.balanceOf(fz.address))
      .to.equal(cfd("70"));

    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("70"));

    expect(await tokenA.balanceOf(sara.address))
      .to.equal(cfd("30"));

    expect(await tokenA.getVotes(sara.address))
      .to.equal(cfd("30"));

    expect(await tokenA.totalSupply())
      .to.equal(cfd("100"));

    expect(await tokenB.getVotes(fz.address))
      .to.equal(cfd("40"));

    expect(await tokenB.getVotes(sara.address)).to.equal(0n);
  });

  it("conserve les voix historiques après un transfert", async function () {
    const receipt = await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    const snapshot = receipt.blockNumber;

    await (
      await tokenA.connect(fz).transfer(sara.address, cfd("30"))
    ).wait();

    expect(
      await tokenA.getPastVotes(fz.address, snapshot)
    ).to.equal(cfd("100"));

    expect(
      await tokenA.getPastVotes(sara.address, snapshot)
    ).to.equal(0n);

    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("70"));
  });

  it("interdit la délégation externe", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    await expect(
      tokenA.connect(fz).delegate(sara.address)
    ).to.be.revertedWithCustomError(
      tokenA,
      "ExternalDelegationDisabled"
    );
  });

  it("refuse un administrateur ou un contrôleur nul", async function () {
    await expect(
      ethers.deployContract("CFDToken", [
        "CFD",
        "CFD",
        1n,
        ethers.ZeroAddress,
        minter.address,
      ])
    ).to.be.revertedWithCustomError(tokenA, "InvalidAddress");

    await expect(
      ethers.deployContract("CFDToken", [
        "CFD",
        "CFD",
        1n,
        admin.address,
        ethers.ZeroAddress,
      ])
    ).to.be.revertedWithCustomError(tokenA, "InvalidAddress");
  });

  it("attribue BURNER_ROLE au contrôleur initial", async function () {
    const role = await tokenA.BURNER_ROLE();

    expect(await tokenA.hasRole(role, minter.address))
      .to.equal(true);

    expect(await tokenA.hasRole(role, outsider.address))
      .to.equal(false);
  });

  it("détruit les CFD et réduit le solde, l'offre et les voix", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    await expect(
      tokenA.connect(minter).burn(fz.address, cfd("30"))
    )
      .to.emit(tokenA, "Transfer")
      .withArgs(
        fz.address,
        ethers.ZeroAddress,
        cfd("30")
      );

    expect(await tokenA.balanceOf(fz.address))
      .to.equal(cfd("70"));

    expect(await tokenA.totalSupply())
      .to.equal(cfd("70"));

    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("70"));
  });

  it("refuse une destruction sans BURNER_ROLE", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    await expect(
      tokenA.connect(outsider).burn(fz.address, cfd("30"))
    )
      .to.be.revertedWithCustomError(
        tokenA,
        "AccessControlUnauthorizedAccount"
      )
      .withArgs(outsider.address, await tokenA.BURNER_ROLE());

    expect(await tokenA.balanceOf(fz.address))
      .to.equal(cfd("100"));
  });

  it("refuse une destruction de zéro jeton", async function () {
    await expect(
      tokenA.connect(minter).burn(fz.address, 0n)
    ).to.be.revertedWithCustomError(tokenA, "ZeroBurnAmount");
  });

  it("refuse une destruction supérieure au solde", async function () {
    await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    await expect(
      tokenA.connect(minter).burn(fz.address, cfd("101"))
    )
      .to.be.revertedWithCustomError(
        tokenA,
        "ERC20InsufficientBalance"
      )
      .withArgs(
        fz.address,
        cfd("100"),
        cfd("101")
      );

    expect(await tokenA.balanceOf(fz.address))
      .to.equal(cfd("100"));
  });

  it("refuse une destruction depuis l'adresse nulle", async function () {
    await expect(
      tokenA.connect(minter).burn(ethers.ZeroAddress, 1n)
    )
      .to.be.revertedWithCustomError(
        tokenA,
        "ERC20InvalidSender"
      )
      .withArgs(ethers.ZeroAddress);
  });

  it("préserve les snapshots après destruction", async function () {
    const receipt = await (
      await tokenA.connect(minter).mint(fz.address, cfd("100"))
    ).wait();

    const snapshot = receipt.blockNumber;

    await (
      await tokenA.connect(minter).burn(fz.address, cfd("30"))
    ).wait();

    expect(await tokenA.getVotes(fz.address))
      .to.equal(cfd("70"));

    expect(
      await tokenA.getPastVotes(fz.address, snapshot)
    ).to.equal(cfd("100"));

    expect(
      await tokenA.getPastTotalSupply(snapshot)
    ).to.equal(cfd("100"));
  });
});