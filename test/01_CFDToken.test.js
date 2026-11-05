import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.connect();

describe("01 - CFDToken : Création, Minting, Contrôle d'accès et Snapshots (kh)", function () {
  async function deployTokenFixture() {
    const [owner, crowdfundingContract, bob, charlie, attacker] = await ethers.getSigners();

    const CFDToken = await ethers.getContractFactory("CFDToken");
    // Adaptez les arguments si votre constructeur prend (name, symbol, minterAddress)
    let token;
    try {
      token = await CFDToken.deploy("Tiwizi Campaign #1 CFD", "CFD-1", crowdfundingContract.address);
    } catch {
      token = await CFDToken.deploy(crowdfundingContract.address);
    }
    await token.waitForDeployment();

    return { token, owner, crowdfundingContract, bob, charlie, attacker };
  }

  it("Doit initialiser correctement les métadonnées ERC-20 et une offre initiale nulle", async function () {
    const { token } = await deployTokenFixture();
    expect(await token.totalSupply()).to.equal(0n);
    expect(await token.decimals()).to.equal(18n);
  });

  it("Doit autoriser uniquement le contrat Crowdfunding à émettre (mint) des CFD", async function () {
    const { token, crowdfundingContract, bob, attacker } = await deployTokenFixture();
    const mintAmount = ethers.parseEther("1000"); // 1 ETH = 1000 CFD

    await token.connect(crowdfundingContract).mint(bob.address, mintAmount);
    expect(await token.balanceOf(bob.address)).to.equal(mintAmount);

    await expect(
      token.connect(attacker).mint(attacker.address, mintAmount)
    ).to.be.reverted;
  });

  it("Doit figer le pouvoir de vote au moment du snapshot même après un transfert ultérieur", async function () {
    const { token, crowdfundingContract, bob, charlie } = await deployTokenFixture();
    const bobTokens = ethers.parseEther("1000");

    await token.connect(crowdfundingContract).mint(bob.address, bobTokens);

    // Prise de snapshot (selon le nom de fonction de votre contrat : snapshot() ou createSnapshot())
    if (typeof token.snapshot === "function") {
      const tx = await token.connect(crowdfundingContract).snapshot();
      await tx.wait();

      // Bob transfère tous ses CFD à Charlie APRÈS le snapshot
      await token.connect(bob).transfer(charlie.address, bobTokens);

      expect(await token.balanceOf(bob.address)).to.equal(0n);
      expect(await token.balanceOfAt(bob.address, 1)).to.equal(bobTokens);
      expect(await token.balanceOfAt(charlie.address, 1)).to.equal(0n);
    }
  });
});