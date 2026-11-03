
import { expect } from "chai";
import hre from "hardhat";

describe("ADWAL - Tests CFDToken et Crowdfunding", function () {
  const ONE_DAY = 24 * 60 * 60;
  const DURATION = 7 * ONE_DAY;
  const IPFS_HASH = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

  async function deployPlatformFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;

    const [
      admin,
      creator,
      beneficiary,
      contributor1,
      contributor2,
      governance,
      attacker
    ] = await ethers.getSigners();

    const cfdToken = await ethers.deployContract("CFDToken", [
      "CFD Test",
      "CFD",
      1n,
      admin.address,
      admin.address
    ]);

    await cfdToken.waitForDeployment();

    const crowdfunding = await ethers.deployContract(
      "Crowdfunding",
      [admin.address]
    );

    await crowdfunding.waitForDeployment();

    const GOAL = ethers.parseEther("2");

    async function createCampaign() {
      const tx = await crowdfunding.connect(creator).createCampaign(
        GOAL,
        DURATION,
        beneficiary.address,
        IPFS_HASH
      );

      await tx.wait();

      const campaignId = await crowdfunding.campaignCount();
      const campaign = await crowdfunding.campaigns(campaignId);

      const campaignToken = await ethers.getContractAt(
        "CFDToken",
        campaign.token
      );

      return { campaignId, campaign, campaignToken };
    }

    return {
      ethers,
      networkHelpers,
      admin,
      creator,
      beneficiary,
      contributor1,
      contributor2,
      governance,
      attacker,
      cfdToken,
      crowdfunding,
      GOAL,
      createCampaign
    };
  }

  // ==========================================================
  // PARTIE 1 - CFDToken
  // ==========================================================

  describe("1. CFDToken - Roles et emission", function () {

    it("1.1 Initialise les parametres et les roles", async function () {
      const { cfdToken, admin } = await deployPlatformFixture();

      expect(await cfdToken.name()).to.equal("CFD Test");
      expect(await cfdToken.symbol()).to.equal("CFD");
      expect(await cfdToken.totalSupply()).to.equal(0n);

      const ADMIN_ROLE = await cfdToken.DEFAULT_ADMIN_ROLE();
      const MINTER_ROLE = await cfdToken.MINTER_ROLE();

      expect(
        await cfdToken.hasRole(ADMIN_ROLE, admin.address)
      ).to.equal(true);

      expect(
        await cfdToken.hasRole(MINTER_ROLE, admin.address)
      ).to.equal(true);
    });

    it("1.2 Refuse les adresses nulles au deploiement", async function () {
      const { ethers, admin } = await deployPlatformFixture();

      await expect(
        ethers.deployContract("CFDToken", [
          "CFD", "CFD", 1n,
          ethers.ZeroAddress,
          admin.address
        ])
      ).to.revert(ethers);

      await expect(
        ethers.deployContract("CFDToken", [
          "CFD", "CFD", 1n,
          admin.address,
          ethers.ZeroAddress
        ])
      ).to.revert(ethers);
    });

    it("1.3 Reserve le mint au MINTER_ROLE", async function () {
      const { ethers, cfdToken, admin, attacker, contributor1 } =
        await deployPlatformFixture();

      const amount = ethers.parseUnits("100", 18);

      await expect(
        cfdToken.connect(attacker).mint(contributor1.address, amount)
      ).to.revert(ethers);

      await cfdToken.connect(admin).mint(contributor1.address, amount);

      expect(
        await cfdToken.balanceOf(contributor1.address)
      ).to.equal(amount);
    });

    it("1.4 Refuse le mint de zero et vers l'adresse nulle", async function () {
      const { ethers, cfdToken, admin, contributor1 } =
        await deployPlatformFixture();

      await expect(
        cfdToken.connect(admin).mint(contributor1.address, 0n)
      ).to.revert(ethers);

      await expect(
        cfdToken.connect(admin).mint(ethers.ZeroAddress, 100n)
      ).to.revert(ethers);
    });

    it("1.5 Active automatiquement les voix", async function () {
      const { ethers, cfdToken, admin, contributor1 } =
        await deployPlatformFixture();

      const amount = ethers.parseUnits("100", 18);

      await cfdToken.connect(admin).mint(contributor1.address, amount);

      expect(
        await cfdToken.getVotes(contributor1.address)
      ).to.equal(amount);
    });

    it("1.6 Interdit la delegation externe", async function () {
      const { ethers, cfdToken, admin, contributor1, contributor2 } =
        await deployPlatformFixture();

      await cfdToken.connect(admin).mint(
        contributor1.address,
        ethers.parseUnits("100", 18)
      );

      await expect(
        cfdToken.connect(contributor1).delegate(contributor2.address)
      ).to.revert(ethers);
    });
  });

  // ==========================================================
  // PARTIE 2 - Crowdfunding
  // ==========================================================

  describe("2. Crowdfunding - Deploiement et campagnes", function () {

    it("2.1 Initialise les constantes et les roles", async function () {
      const { crowdfunding, admin } = await deployPlatformFixture();

      const ADMIN_ROLE = await crowdfunding.ADMIN_ROLE();

      expect(
        await crowdfunding.hasRole(ADMIN_ROLE, admin.address)
      ).to.equal(true);

      expect(await crowdfunding.campaignCount()).to.equal(0n);
      expect(await crowdfunding.PLATFORM_FEE_BPS()).to.equal(300n);
      expect(await crowdfunding.MIN_DURATION()).to.equal(BigInt(ONE_DAY));
      expect(await crowdfunding.MAX_DURATION()).to.equal(BigInt(90 * ONE_DAY));
    });

    it("2.2 Refuse un administrateur nul", async function () {
      const { ethers } = await deployPlatformFixture();

      await expect(
        ethers.deployContract("Crowdfunding", [ethers.ZeroAddress])
      ).to.be.revertedWith("Admin zero address");
    });

    it("2.3 Cree une campagne et son propre CFDToken", async function () {
      const {
        crowdfunding,
        creator,
        beneficiary,
        GOAL,
        createCampaign
      } = await deployPlatformFixture();

      const { campaignId, campaign, campaignToken } =
        await createCampaign();

      expect(campaignId).to.equal(1n);
      expect(campaign.creator).to.equal(creator.address);
      expect(campaign.beneficiary).to.equal(beneficiary.address);
      expect(campaign.goal).to.equal(GOAL);
      expect(campaign.ipfsHash).to.equal(IPFS_HASH);
      expect(await campaignToken.totalSupply()).to.equal(0n);
      expect(await crowdfunding.campaignCount()).to.equal(1n);
    });

    it("2.4 Refuse un objectif nul", async function () {
      const { crowdfunding, creator, beneficiary } =
        await deployPlatformFixture();

      await expect(
        crowdfunding.connect(creator).createCampaign(
          0n, DURATION, beneficiary.address, IPFS_HASH
        )
      ).to.be.revertedWith("Goal must be > 0");
    });

    it("2.5 Refuse un beneficiaire nul", async function () {
      const { ethers, crowdfunding, creator, GOAL } =
        await deployPlatformFixture();

      await expect(
        crowdfunding.connect(creator).createCampaign(
          GOAL, DURATION, ethers.ZeroAddress, IPFS_HASH
        )
      ).to.be.revertedWith("Beneficiary is zero address");
    });

    it("2.6 Refuse les durees invalides", async function () {
      const { crowdfunding, creator, beneficiary, GOAL } =
        await deployPlatformFixture();

      await expect(
        crowdfunding.connect(creator).createCampaign(
          GOAL, 0, beneficiary.address, IPFS_HASH
        )
      ).to.be.revertedWith("Invalid duration");

      await expect(
        crowdfunding.connect(creator).createCampaign(
          GOAL, 91 * ONE_DAY, beneficiary.address, IPFS_HASH
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("2.7 Refuse un CID IPFS vide", async function () {
      const { crowdfunding, creator, beneficiary, GOAL } =
        await deployPlatformFixture();

      await expect(
        crowdfunding.connect(creator).createCampaign(
          GOAL, DURATION, beneficiary.address, ""
        )
      ).to.be.revertedWith("IPFS hash required");
    });
  });

  // ==========================================================
  // PARTIE 3 - Integration
  // ==========================================================

  describe("3. Contributions et remboursements", function () {

    it("3.1 Enregistre les contributions et distribue les CFD", async function () {
      const {
        ethers,
        crowdfunding,
        contributor1,
        createCampaign
      } = await deployPlatformFixture();

      const { campaignId, campaignToken } = await createCampaign();

      const amount = ethers.parseEther("0.5");
      const rate = await crowdfunding.CFD_RATE();
      const expectedCFD = amount * rate;

      await expect(
        crowdfunding.connect(contributor1).contribute(campaignId, {
          value: amount
        })
      ).to.emit(crowdfunding, "Contributed")
        .withArgs(
          campaignId,
          contributor1.address,
          amount,
          expectedCFD
        );

      expect(
        await crowdfunding.contributions(campaignId, contributor1.address)
      ).to.equal(amount);

      expect(
        await campaignToken.balanceOf(contributor1.address)
      ).to.equal(expectedCFD);

      expect(
        await campaignToken.getVotes(contributor1.address)
      ).to.equal(expectedCFD);
    });

    it("3.2 Refuse les contributions invalides", async function () {
      const {
        ethers,
        networkHelpers,
        crowdfunding,
        contributor1,
        createCampaign
      } = await deployPlatformFixture();

      const { campaignId } = await createCampaign();

      await expect(
        crowdfunding.connect(contributor1).contribute(campaignId, {
          value: 0n
        })
      ).to.revert(ethers);

      await expect(
        crowdfunding.connect(contributor1).contribute(999n, {
          value: ethers.parseEther("1")
        })
      ).to.revert(ethers);

      await networkHelpers.time.increase(8 * ONE_DAY);

      await expect(
        crowdfunding.connect(contributor1).contribute(campaignId, {
          value: ethers.parseEther("1")
        })
      ).to.revert(ethers);
    });

    it("3.3 Rembourse une campagne echouee une seule fois", async function () {
      const {
        ethers,
        networkHelpers,
        crowdfunding,
        contributor1,
        createCampaign
      } = await deployPlatformFixture();

      const { campaignId, campaignToken } = await createCampaign();

      const amount = ethers.parseEther("0.5");

      await crowdfunding.connect(contributor1).contribute(campaignId, {
        value: amount
      });

      await networkHelpers.time.increase(8 * ONE_DAY);

      await crowdfunding.finalizeCampaign(campaignId);

      const campaign = await crowdfunding.campaigns(campaignId);

      // CampaignStatus.Failed = 2
      expect(campaign.status).to.equal(2n);

      await expect(
        crowdfunding.connect(contributor1).refund(campaignId)
      ).to.emit(crowdfunding, "Refunded");

      expect(
        await campaignToken.balanceOf(contributor1.address)
      ).to.equal(0n);

      await expect(
        crowdfunding.connect(contributor1).refund(campaignId)
      ).to.revert(ethers);
    });

    it("3.4 Finalise en Successful si l'objectif est atteint", async function () {
      const {
        ethers,
        networkHelpers,
        crowdfunding,
        contributor1,
        GOAL,
        createCampaign
      } = await deployPlatformFixture();

      const { campaignId } = await createCampaign();

      await crowdfunding.connect(contributor1).contribute(campaignId, {
        value: GOAL
      });

      await networkHelpers.time.increase(8 * ONE_DAY);

      await crowdfunding.finalizeCampaign(campaignId);

      const campaign = await crowdfunding.campaigns(campaignId);

      // CampaignStatus.Successful = 1
      expect(campaign.status).to.equal(1n);
      expect(campaign.totalRaised).to.equal(GOAL);
    });

    it("3.5 Reserve le gel des campagnes a la gouvernance", async function () {
      const {
        crowdfunding,
        attacker,
        createCampaign
      } = await deployPlatformFixture();

      const { campaignId } = await createCampaign();

      await expect(
        crowdfunding.connect(attacker).setFrozen(campaignId, true)
      ).to.be.revertedWith("Only governance");
    });
  });
});
