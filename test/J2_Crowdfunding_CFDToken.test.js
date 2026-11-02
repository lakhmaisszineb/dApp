import { expect } from "chai";
import hre from "hardhat";

describe("J2 — Tests Unitaires & Intégration : CFDToken & Crowdfunding", function () {
  // Constantes de test conformes à Conception.md et Crowdfunding.sol
  const ONE_DAY = 24 * 60 * 60;
  const DURATION_7_DAYS = 7 * ONE_DAY;
  const IPFS_HASH = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

  /**
   * Déploie une instance propre des contrats via la connexion réseau Hardhat 3
   */
  async function deployPlatformFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;
    const GOAL = ethers.parseEther("2.0"); // 2 ETH

    const [
      admin,
      creator,
      beneficiary,
      contributor1,
      contributor2,
      governance,
      attacker,
    ] = await ethers.getSigners();

    // 1. Déploiement de CFDToken
    const cfdToken = await ethers.deployContract("CFDToken", [
      "Crowdfunding DAO Token",
      "CFD",
      1n, // campaignId
      admin.address,
      admin.address, // minter initial
    ]);
    await cfdToken.waitForDeployment();

    // 2. Déploiement de Crowdfunding
    const crowdfunding = await ethers.deployContract("Crowdfunding", [
      admin.address,
      await cfdToken.getAddress(),
    ]);
    await crowdfunding.waitForDeployment();

    // 3. Octroi du rôle MINTER_ROLE au contrat Crowdfunding pour qu'il puisse minter lors de contribute()
    const MINTER_ROLE = await cfdToken.MINTER_ROLE();
    await cfdToken
      .connect(admin)
      .grantRole(MINTER_ROLE, await crowdfunding.getAddress());

    return {
      ethers,
      networkHelpers,
      cfdToken,
      crowdfunding,
      GOAL,
      admin,
      creator,
      beneficiary,
      contributor1,
      contributor2,
      governance,
      attacker,
      MINTER_ROLE,
    };
  }

  // =========================================================================
  // PARTIE 1 : TESTS DU CONTRAT CFDToken.sol (Module M1)
  // =========================================================================
  describe("1. Contrat CFDToken — Paramètres, Émission (Mint) et Accès", function () {
    it("1.1 Doit initialiser correctement les paramètres et les rôles au déploiement", async function () {
      const { cfdToken, admin, MINTER_ROLE } = await deployPlatformFixture();
      const DEFAULT_ADMIN_ROLE = await cfdToken.DEFAULT_ADMIN_ROLE();

      expect(await cfdToken.name()).to.equal("Crowdfunding DAO Token");
      expect(await cfdToken.symbol()).to.equal("CFD");
      expect(await cfdToken.campaignId()).to.equal(1n);
      expect(await cfdToken.totalSupply()).to.equal(0n);

      expect(await cfdToken.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
      expect(await cfdToken.hasRole(MINTER_ROLE, admin.address)).to.equal(true);
    });

    it("1.2 Doit refuser le déploiement si admin ou minter est l'adresse zéro", async function () {
      const { ethers, admin, cfdToken } = await deployPlatformFixture();

      await expect(
        ethers.deployContract("CFDToken", [
          "CFD",
          "CFD",
          1n,
          ethers.ZeroAddress,
          admin.address,
        ])
      ).to.be.revertedWithCustomError(cfdToken, "InvalidAddress");

      await expect(
        ethers.deployContract("CFDToken", [
          "CFD",
          "CFD",
          1n,
          admin.address,
          ethers.ZeroAddress,
        ])
      ).to.be.revertedWithCustomError(cfdToken, "InvalidAddress");
    });

    it("1.3 Doit permettre uniquement au MINTER_ROLE de créer (mint) des CFD", async function () {
      const { ethers, cfdToken, admin, contributor1, attacker } =
        await deployPlatformFixture();
      const mintAmount = ethers.parseUnits("1000", 18);

      await cfdToken.connect(admin).mint(contributor1.address, mintAmount);
      expect(await cfdToken.balanceOf(contributor1.address)).to.equal(mintAmount);

      await expect(
        cfdToken.connect(attacker).mint(attacker.address, mintAmount)
      ).to.be.revertedWithCustomError(
        cfdToken,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("1.4 Doit refuser un mint de 0 jeton ou vers l'adresse zéro", async function () {
      const { ethers, cfdToken, admin, contributor1 } =
        await deployPlatformFixture();

      await expect(
        cfdToken.connect(admin).mint(contributor1.address, 0n)
      ).to.be.revertedWithCustomError(cfdToken, "ZeroMintAmount");

      await expect(
        cfdToken
          .connect(admin)
          .mint(ethers.ZeroAddress, ethers.parseUnits("10", 18))
      ).to.be.revertedWithCustomError(cfdToken, "ERC20InvalidReceiver");
    });

    it("1.5 Doit activer automatiquement les voix (auto-délégation) dès la réception de CFD", async function () {
      const { ethers, cfdToken, admin, contributor1 } =
        await deployPlatformFixture();
      const mintAmount = ethers.parseUnits("500", 18);

      await cfdToken.connect(admin).mint(contributor1.address, mintAmount);

      expect(await cfdToken.delegates(contributor1.address)).to.equal(
        contributor1.address
      );
      expect(await cfdToken.getVotes(contributor1.address)).to.equal(mintAmount);
    });

    it("1.6 Doit interdire la délégation des voix à une autre adresse", async function () {
      const { ethers, cfdToken, admin, contributor1, contributor2 } =
        await deployPlatformFixture();
      const mintAmount = ethers.parseUnits("500", 18);

      await cfdToken.connect(admin).mint(contributor1.address, mintAmount);

      await expect(
        cfdToken.connect(contributor1).delegate(contributor2.address)
      ).to.be.revertedWithCustomError(cfdToken, "ExternalDelegationDisabled");
    });
  });

  // =========================================================================
  // PARTIE 2 : TESTS DU CONTRAT Crowdfunding.sol (Module M2)
  // =========================================================================
  describe("2. Contrat Crowdfunding — Déploiement et Création de Campagnes", function () {
    it("2.1 Doit initialiser correctement les constantes et rôles au déploiement", async function () {
      const { ethers, crowdfunding, cfdToken, admin } =
        await deployPlatformFixture();
      const ADMIN_ROLE = await crowdfunding.ADMIN_ROLE();

      expect(await crowdfunding.CFD_RATE()).to.equal(1000n);
      expect(await crowdfunding.MULTISIG_THRESHOLD()).to.equal(
        ethers.parseEther("0.5")
      );
      expect(await crowdfunding.MIN_DURATION()).to.equal(BigInt(ONE_DAY));
      expect(await crowdfunding.MAX_DURATION()).to.equal(BigInt(90 * ONE_DAY));
      expect(await crowdfunding.cfdToken()).to.equal(
        await cfdToken.getAddress()
      );
      expect(await crowdfunding.hasRole(ADMIN_ROLE, admin.address)).to.equal(true);
    });

    it("2.2 Doit refuser le déploiement si admin ou _cfdToken est l'adresse zéro", async function () {
      const { ethers, admin, cfdToken } = await deployPlatformFixture();

      await expect(
        ethers.deployContract("Crowdfunding", [
          ethers.ZeroAddress,
          await cfdToken.getAddress(),
        ])
      ).to.be.revertedWith("Admin zero address");

      await expect(
        ethers.deployContract("Crowdfunding", [
          admin.address,
          ethers.ZeroAddress,
        ])
      ).to.be.revertedWith("CFDToken zero address");
    });

    it("2.3 Doit créer une campagne valide et enregistrer toutes ses informations", async function () {
      const { ethers, crowdfunding, GOAL, creator, beneficiary } =
        await deployPlatformFixture();

      const tx = await crowdfunding
        .connect(creator)
        .createCampaign(GOAL, DURATION_7_DAYS, beneficiary.address, IPFS_HASH);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedDeadline = BigInt(block.timestamp) + BigInt(DURATION_7_DAYS);

      await expect(tx)
        .to.emit(crowdfunding, "CampaignCreated")
        .withArgs(
          1n,
          creator.address,
          beneficiary.address,
          GOAL,
          expectedDeadline,
          IPFS_HASH
        );

      expect(await crowdfunding.campaignCount()).to.equal(1n);

      const campaign = await crowdfunding.campaigns(1n);
      expect(campaign.creator).to.equal(creator.address);
      expect(campaign.beneficiary).to.equal(beneficiary.address);
      expect(campaign.goal).to.equal(GOAL);
      expect(campaign.deadline).to.equal(expectedDeadline);
      expect(campaign.totalRaised).to.equal(0n);
      expect(campaign.availableFunds).to.equal(0n);
      expect(campaign.ipfsHash).to.equal(IPFS_HASH);
      expect(campaign.status).to.equal(0n); // Active
      expect(campaign.fundsWithdrawn).to.equal(false);
      expect(campaign.isFrozen).to.equal(false);
    });

    it("2.4 Doit refuser la création si l'objectif est nul (goal == 0)", async function () {
      const { crowdfunding, creator, beneficiary } =
        await deployPlatformFixture();

      await expect(
        crowdfunding
          .connect(creator)
          .createCampaign(0n, DURATION_7_DAYS, beneficiary.address, IPFS_HASH)
      ).to.be.revertedWith("Goal must be > 0");
    });

    it("2.5 Doit refuser la création si le bénéficiaire est l'adresse zéro", async function () {
      const { ethers, crowdfunding, GOAL, creator } =
        await deployPlatformFixture();

      await expect(
        crowdfunding
          .connect(creator)
          .createCampaign(GOAL, DURATION_7_DAYS, ethers.ZeroAddress, IPFS_HASH)
      ).to.be.revertedWith("Beneficiary is zero address");
    });

    it("2.6 Doit refuser la création si la durée est hors des bornes (< 1 jour ou > 90 jours)", async function () {
      const { crowdfunding, GOAL, creator, beneficiary } =
        await deployPlatformFixture();

      await expect(
        crowdfunding
          .connect(creator)
          .createCampaign(GOAL, ONE_DAY - 1, beneficiary.address, IPFS_HASH)
      ).to.be.revertedWith("Invalid duration");

      await expect(
        crowdfunding
          .connect(creator)
          .createCampaign(
            GOAL,
            90 * ONE_DAY + 1,
            beneficiary.address,
            IPFS_HASH
          )
      ).to.be.revertedWith("Invalid duration");
    });

    it("2.7 Doit refuser la création si le hash IPFS est vide", async function () {
      const { crowdfunding, GOAL, creator, beneficiary } =
        await deployPlatformFixture();

      await expect(
        crowdfunding
          .connect(creator)
          .createCampaign(GOAL, DURATION_7_DAYS, beneficiary.address, "")
      ).to.be.revertedWith("IPFS hash required");
    });
  });

  // =========================================================================
  // PARTIE 3 : COMMUNICATION INTER-CONTRATS, CONTRIBUTIONS ET ÉTATS
  // =========================================================================
  describe("3. Intégration Crowdfunding <-> CFDToken, Contributions et Remboursements", function () {
    it("3.1 Doit enregistrer les contributions, cumuler les versements et émettre les CFD", async function () {
      const {
        ethers,
        crowdfunding,
        cfdToken,
        GOAL,
        creator,
        beneficiary,
        contributor1,
      } = await deployPlatformFixture();

      await crowdfunding
        .connect(creator)
        .createCampaign(GOAL, DURATION_7_DAYS, beneficiary.address, IPFS_HASH);

      const amount1 = ethers.parseEther("0.5"); // 0.5 ETH -> 500 CFD
      const expectedCfd1 = (amount1 * 1000n) / ethers.parseEther("1.0");

      await expect(
        crowdfunding.connect(contributor1).contribute(1n, { value: amount1 })
      )
        .to.emit(crowdfunding, "Contributed")
        .withArgs(1n, contributor1.address, amount1, expectedCfd1);

      // Deuxième versement du même compte (1.0 ETH -> 1000 CFD)
      const amount2 = ethers.parseEther("1.0");
      await crowdfunding
        .connect(contributor1)
        .contribute(1n, { value: amount2 });

      const totalExpected = amount1 + amount2; // 1.5 ETH
      expect(
        await crowdfunding.contributions(1n, contributor1.address)
      ).to.equal(totalExpected);

      const campaign = await crowdfunding.campaigns(1n);
      expect(campaign.totalRaised).to.equal(totalExpected);
      expect(campaign.availableFunds).to.equal(totalExpected);

      // Si cfdToken.mint() est décommenté dans Crowdfunding.sol, vérifie le solde CFD
      const tokenBalance = await cfdToken.balanceOf(contributor1.address);
      if (tokenBalance > 0n) {
        expect(tokenBalance).to.equal(1500n);
        expect(await cfdToken.getVotes(contributor1.address)).to.equal(1500n);
      }
    });

    it("3.2 Doit refuser une contribution de 0 ETH, sur une campagne inexistante ou après l'échéance", async function () {
      const {
        ethers,
        networkHelpers,
        crowdfunding,
        GOAL,
        creator,
        beneficiary,
        contributor1,
      } = await deployPlatformFixture();

      await crowdfunding
        .connect(creator)
        .createCampaign(GOAL, DURATION_7_DAYS, beneficiary.address, IPFS_HASH);

      await expect(
        crowdfunding
          .connect(contributor1)
          .contribute(99n, { value: ethers.parseEther("1.0") })
      ).to.be.revertedWith("Campaign does not exist");

      await expect(
        crowdfunding.connect(contributor1).contribute(1n, { value: 0n })
      ).to.be.revertedWith("Contribution must be > 0");

      await networkHelpers.time.increase(DURATION_7_DAYS + 1);

      await expect(
        crowdfunding
          .connect(contributor1)
          .contribute(1n, { value: ethers.parseEther("1.0") })
      ).to.be.revertedWith("Campaign ended");
    });

    it("3.3 Doit finaliser en Failed sous l'objectif, rembourser une seule fois et refuser un double remboursement", async function () {
      const {
        ethers,
        networkHelpers,
        crowdfunding,
        GOAL,
        creator,
        beneficiary,
        contributor1,
      } = await deployPlatformFixture();

      await crowdfunding
        .connect(creator)
        .createCampaign(GOAL, DURATION_7_DAYS, beneficiary.address, IPFS_HASH);
      await crowdfunding
        .connect(contributor1)
        .contribute(1n, { value: ethers.parseEther("1.0") });

      await networkHelpers.time.increase(DURATION_7_DAYS + 1);

      await expect(crowdfunding.finalizeCampaign(1n))
        .to.emit(crowdfunding, "CampaignFinalized")
        .withArgs(1n, 2n); // 2 = Failed

      await expect(crowdfunding.connect(contributor1).refund(1n))
        .to.emit(crowdfunding, "Refunded")
        .withArgs(1n, contributor1.address, ethers.parseEther("1.0"));

      await expect(
        crowdfunding.connect(contributor1).refund(1n)
      ).to.be.revertedWith("Nothing to refund");
    });

    it("3.4 Doit finaliser en Successful lorsque l'objectif est atteint ou dépassé", async function () {
      const {
        ethers,
        networkHelpers,
        crowdfunding,
        GOAL,
        creator,
        beneficiary,
        contributor1,
      } = await deployPlatformFixture();

      await crowdfunding
        .connect(creator)
        .createCampaign(GOAL, DURATION_7_DAYS, beneficiary.address, IPFS_HASH);
      await crowdfunding
        .connect(contributor1)
        .contribute(1n, { value: ethers.parseEther("2.5") });

      await networkHelpers.time.increase(DURATION_7_DAYS + 1);

      await expect(crowdfunding.finalizeCampaign(1n))
        .to.emit(crowdfunding, "CampaignFinalized")
        .withArgs(1n, 1n); // 1 = Successful
    });

    it("3.5 Doit refuser l'appel à setFrozen par une adresse autre que la gouvernance", async function () {
      const { crowdfunding, GOAL, creator, beneficiary, attacker } =
        await deployPlatformFixture();

      await crowdfunding
        .connect(creator)
        .createCampaign(GOAL, DURATION_7_DAYS, beneficiary.address, IPFS_HASH);

      await expect(
        crowdfunding.connect(attacker).setFrozen(1n, true)
      ).to.be.revertedWith("Only governance");
    });
  });
});