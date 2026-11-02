/**
 * Tests de Governance.sol.
 *
 * Environnement :
 * - Hardhat 3 ;
 * - Ethers 6 ;
 * - OpenZeppelin 5 ;
 * - Mocha et Chai.
 *
 * Ces tests déploient :
 * - Crowdfunding ;
 * - Governance ;
 * - les CFDToken créés par Crowdfunding.
 *
 * Les comptes et les ETH utilisés sont uniquement locaux.
 *
 * API attendue de Governance :
 * - constructor(admin, crowdfundingAddress)
 * - createProposal(campaignId, proposalType)
 * - vote(proposalId, support)
 * - executeProposal(proposalId)
 * - proposals(proposalId)
 * - getProposalState(proposalId)
 * - getVotingWeight(proposalId, voter)
 * - getParticipation(proposalId)
 * - hasVoted(proposalId, voter)
 */

import { expect } from "chai";
import { network } from "hardhat";

// Connexion au réseau local de test de Hardhat.
const { ethers, networkHelpers } = await network.getOrCreate();

// Les durées sont exprimées en secondes.
const DAY = 24 * 60 * 60;
const DURATION = 30 * DAY;

// Le contrat vérifie seulement que cette référence n'est pas vide.
// Aucun téléchargement IPFS n'est effectué dans ces tests.
const CID = "ipfs://metadata-test";

// Conversion des montants en petites unités.
const eth = (value) => ethers.parseEther(value);
const cfd = (value) => ethers.parseUnits(value, 18);

// Ces valeurs doivent correspondre aux enums du contrat.
const TYPE = {
    Withdrawal: 0,
    Freeze: 1,
    Unfreeze: 2,
    Cancel: 3,
};

const STATE = {
    Active: 0n,
    Succeeded: 1n,
    Defeated: 2n,
    Executed: 3n,
};

/**
 * Prépare un environnement initial.
 *
 * Chaque test retrouve cet état grâce à loadFixture().
 * Les changements d'un test n'affectent donc pas le suivant.
 */
async function deployFixture() {
    const [
        admin,
        creator,
        beneficiary,
        alice,
        bob,
        charlie,
        outsider,
    ] = await ethers.getSigners();

    // 1. Déployer la plateforme.
    const crowdfunding = await ethers.deployContract(
        "Crowdfunding",
        [admin.address]
    );

    await crowdfunding.waitForDeployment();

    // 2. Déployer la gouvernance liée à cette plateforme.
    const governance = await ethers.deployContract(
        "Governance",
        [
            admin.address,
            await crowdfunding.getAddress(),
        ]
    );

    await governance.waitForDeployment();

    // 3. Autoriser le vrai contrat Governance à agir sur Crowdfunding.
    await (
        await crowdfunding.connect(admin).setGovernance(
            await governance.getAddress()
        )
    ).wait();

    // 4. Créer une campagne de 30 jours avec un objectif de 10 ETH.
    await (
        await crowdfunding.connect(creator).createCampaign(
            eth("10"),
            DURATION,
            beneficiary.address,
            CID
        )
    ).wait();

    const campaignId = await crowdfunding.campaignCount();
    const campaign = await crowdfunding.campaigns(campaignId);

    // Chaque campagne possède sa propre instance de CFDToken.
    const token = await ethers.getContractAt(
        "CFDToken",
        campaign.token
    );

    // Alice contribue 1 ETH : elle reçoit 1000 CFD.
    await (
        await crowdfunding.connect(alice).contribute(
            campaignId,
            { value: eth("1") }
        )
    ).wait();

    // Bob contribue 0,1 ETH : il reçoit 100 CFD.
    await (
        await crowdfunding.connect(bob).contribute(
            campaignId,
            { value: eth("0.1") }
        )
    ).wait();

    // Offre totale : 1100 CFD.
    // Quorum de 20 % : 220 CFD.
    return {
        admin,
        creator,
        beneficiary,
        alice,
        bob,
        charlie,
        outsider,
        crowdfunding,
        governance,
        token,
        campaignId,
    };
}

describe("J3 - Governance", function () {
    let f;

    beforeEach(async function () {
        f = await networkHelpers.loadFixture(deployFixture);
    });

    /**
     * Crée une proposition et récupère ses informations.
     */
    async function propose(
        type = TYPE.Freeze,
        signer = f.alice,
        campaignId = f.campaignId
    ) {
        const tx = await f.governance
            .connect(signer)
            .createProposal(campaignId, type);

        const receipt = await tx.wait();
        const id = await f.governance.proposalCount();
        const proposal = await f.governance.proposals(id);

        return {
            id,
            proposal,
            tx,
            receipt,
        };
    }

    /**
     * Enregistre un vote.
     *
     * support = true : pour.
     * support = false : contre.
     */
    async function cast(id, signer, support) {
        await (
            await f.governance
                .connect(signer)
                .vote(id, support)
        ).wait();
    }

    /**
     * Avance le temps local jusqu'à la fin du vote.
     */
    async function endVote(id) {
        const proposal = await f.governance.proposals(id);

        await networkHelpers.time.increaseTo(
            proposal.deadline
        );
    }

    /**
     * Avance le temps local jusqu'à la date d'exécution autorisée.
     */
    async function reachExecution(id) {
        const proposal = await f.governance.proposals(id);

        await networkHelpers.time.increaseTo(
            proposal.executableAt
        );
    }

    /**
     * Crée, fait adopter et exécute une proposition.
     *
     * Alice possède suffisamment de voix pour atteindre le quorum
     * dans les campagnes utilisées par cette fonction.
     */
    async function adoptAndExecute(
        type,
        campaignId = f.campaignId,
        proposer = f.alice
    ) {
        const { id } = await propose(
            type,
            proposer,
            campaignId
        );

        await cast(id, f.alice, true);
        await reachExecution(id);

        // N'importe quelle adresse peut déclencher une décision adoptée.
        // Elle ne choisit pas le résultat du vote.
        await (
            await f.governance
                .connect(f.outsider)
                .executeProposal(id)
        ).wait();

        return id;
    }

    /**
     * Prépare une campagne ayant atteint son objectif
     * et disposant déjà d'une demande de retrait.
     *
     * Le montant reste sous le seuil multisig de 0,5 ETH
     * pour tester ici uniquement la gouvernance.
     */
    async function prepareWithdrawal() {
        await (
            await f.crowdfunding
                .connect(f.creator)
                .createCampaign(
                    eth("0.2"),
                    DURATION,
                    f.beneficiary.address,
                    CID
                )
        ).wait();

        const campaignId =
            await f.crowdfunding.campaignCount();

        await (
            await f.crowdfunding
                .connect(f.alice)
                .contribute(
                    campaignId,
                    { value: eth("0.2") }
                )
        ).wait();

        await (
            await f.crowdfunding
                .connect(f.beneficiary)
                .requestWithdrawal(campaignId)
        ).wait();

        return campaignId;
    }

    // ============================================================
    // DÉPLOIEMENT ET CONFIGURATION
    // ============================================================

    it("enregistre la plateforme, le quorum et les durées", async function () {
        expect(
            await f.governance.crowdfunding()
        ).to.equal(
            await f.crowdfunding.getAddress()
        );

        expect(
            await f.governance.QUORUM_BPS()
        ).to.equal(2000n);

        expect(
            await f.governance.BPS_DENOMINATOR()
        ).to.equal(10000n);

        expect(
            await f.governance.VOTING_PERIOD()
        ).to.equal(BigInt(3 * DAY));

        expect(
            await f.governance.EXECUTION_DELAY()
        ).to.equal(BigInt(DAY));

        expect(
            await f.governance.proposalCount()
        ).to.equal(0n);
    });

    it("refuse un administrateur nul", async function () {
        await expect(
            ethers.deployContract(
                "Governance",
                [
                    ethers.ZeroAddress,
                    await f.crowdfunding.getAddress(),
                ]
            )
        ).to.be.revertedWith("Admin zero address");
    });

    it("refuse une plateforme nulle ou sans code", async function () {
        await expect(
            ethers.deployContract(
                "Governance",
                [
                    f.admin.address,
                    ethers.ZeroAddress,
                ]
            )
        ).to.be.revertedWith("Crowdfunding zero address");

        await expect(
            ethers.deployContract(
                "Governance",
                [
                    f.admin.address,
                    f.outsider.address,
                ]
            )
        ).to.be.revertedWith(
            "Crowdfunding must be a contract"
        );
    });

    // ============================================================
    // CRÉATION DES PROPOSITIONS
    // ============================================================

    it("enregistre la proposition, le snapshot précédent et le quorum figé", async function () {
        const {
            id,
            proposal: p,
            tx,
            receipt,
        } = await propose();

        const block = await ethers.provider.getBlock(
            receipt.blockNumber
        );

        expect(p.campaignId).to.equal(f.campaignId);

        expect(p.proposer).to.equal(
            f.alice.address
        );

        expect(p.token).to.equal(
            await f.token.getAddress()
        );

        expect(p.proposalType).to.equal(
            BigInt(TYPE.Freeze)
        );

        expect(p.snapshotBlock).to.equal(
            BigInt(receipt.blockNumber - 1)
        );

        expect(p.snapshotSupply).to.equal(
            cfd("1100")
        );

        expect(p.quorumRequired).to.equal(
            cfd("220")
        );

        expect(p.createdAt).to.equal(
            BigInt(block.timestamp)
        );

        expect(p.deadline).to.equal(
            p.createdAt + BigInt(3 * DAY)
        );

        expect(p.executableAt).to.equal(
            p.deadline + BigInt(DAY)
        );

        expect(p.executed).to.equal(false);

        await expect(tx)
            .to.emit(f.governance, "ProposalCreated")
            .withArgs(
                id,
                f.campaignId,
                TYPE.Freeze,
                f.alice.address,
                p.deadline,
                p.snapshotBlock
            );
    });

    it("refuse une campagne inexistante", async function () {
        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(999n, TYPE.Freeze)
        ).to.be.revertedWith(
            "Campaign does not exist"
        );
    });

    it("refuse un proposant sans CFD de la campagne", async function () {
        await expect(
            f.governance
                .connect(f.outsider)
                .createProposal(
                    f.campaignId,
                    TYPE.Freeze
                )
        ).to.be.revertedWith(
            "No CFD at snapshot"
        );
    });

    it("refuse une proposition si aucun CFD n'existe au snapshot", async function () {
        await (
            await f.crowdfunding.createCampaign(
                eth("10"),
                DURATION,
                f.beneficiary.address,
                CID
            )
        ).wait();

        const campaignId =
            await f.crowdfunding.campaignCount();

        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(
                    campaignId,
                    TYPE.Freeze
                )
        ).to.be.revertedWith(
            "No CFD at snapshot"
        );
    });

    it("n'accepte pas les CFD d'une autre campagne", async function () {
        await (
            await f.crowdfunding.createCampaign(
                eth("10"),
                DURATION,
                f.beneficiary.address,
                CID
            )
        ).wait();

        const otherId =
            await f.crowdfunding.campaignCount();

        await (
            await f.crowdfunding
                .connect(f.bob)
                .contribute(
                    otherId,
                    { value: eth("0.1") }
                )
        ).wait();

        // Alice a des CFD de la première campagne,
        // mais aucun de cette nouvelle campagne.
        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(
                    otherId,
                    TYPE.Freeze
                )
        ).to.be.revertedWith(
            "No CFD at snapshot"
        );
    });

    // ============================================================
    // VOTES ET SNAPSHOTS
    // ============================================================

    it("enregistre les poids pour et contre et l'événement de vote", async function () {
        const { id } = await propose();

        await expect(
            f.governance
                .connect(f.alice)
                .vote(id, true)
        )
            .to.emit(f.governance, "VoteCast")
            .withArgs(
                id,
                f.alice.address,
                true,
                cfd("1000")
            );

        await cast(id, f.bob, false);

        const p =
            await f.governance.proposals(id);

        expect(p.forVotes).to.equal(
            cfd("1000")
        );

        expect(p.againstVotes).to.equal(
            cfd("100")
        );

        expect(
            await f.governance.getParticipation(id)
        ).to.equal(
            cfd("1100")
        );

        expect(
            await f.governance.getVotingWeight(
                id,
                f.alice.address
            )
        ).to.equal(
            cfd("1000")
        );

        expect(
            await f.governance.hasVoted(
                id,
                f.alice.address
            )
        ).to.equal(true);

        // Voter ne dépense pas les CFD.
        expect(
            await f.token.balanceOf(
                f.alice.address
            )
        ).to.equal(
            cfd("1000")
        );
    });

    it("refuse un vote sans voix au snapshot", async function () {
        const { id } = await propose();

        await expect(
            f.governance
                .connect(f.outsider)
                .vote(id, true)
        ).to.be.revertedWith(
            "No voting power"
        );
    });

    it("refuse un second vote de la même adresse sur la même proposition", async function () {
        const { id } = await propose();

        await cast(id, f.alice, true);

        await expect(
            f.governance
                .connect(f.alice)
                .vote(id, false)
        ).to.be.revertedWith(
            "Already voted"
        );
    });

    it("permet de voter séparément sur deux propositions", async function () {
        const a = await propose();
        const b = await propose();

        await cast(a.id, f.alice, true);
        await cast(b.id, f.alice, false);

        expect(
            await f.governance.hasVoted(
                a.id,
                f.alice.address
            )
        ).to.equal(true);

        expect(
            await f.governance.hasVoted(
                b.id,
                f.alice.address
            )
        ).to.equal(true);
    });

    it("conserve les poids après transfert et empêche de réutiliser les mêmes voix", async function () {
        const { id } = await propose();

        await cast(id, f.alice, true);

        // Alice transfère ses CFD après le snapshot.
        await (
            await f.token
                .connect(f.alice)
                .transfer(
                    f.charlie.address,
                    cfd("1000")
                )
        ).wait();

        expect(
            await f.token.getVotes(
                f.charlie.address
            )
        ).to.equal(
            cfd("1000")
        );

        // Les droits de cette proposition restent historiques.
        expect(
            await f.governance.getVotingWeight(
                id,
                f.alice.address
            )
        ).to.equal(
            cfd("1000")
        );

        expect(
            await f.governance.getVotingWeight(
                id,
                f.charlie.address
            )
        ).to.equal(0n);

        await expect(
            f.governance
                .connect(f.charlie)
                .vote(id, true)
        ).to.be.revertedWith(
            "No voting power"
        );

        expect(
            (await f.governance.proposals(id)).forVotes
        ).to.equal(
            cfd("1000")
        );
    });

    it("ne change pas le quorum après une nouvelle contribution", async function () {
        const { id } = await propose();

        await (
            await f.crowdfunding
                .connect(f.charlie)
                .contribute(
                    f.campaignId,
                    { value: eth("1") }
                )
        ).wait();

        const p =
            await f.governance.proposals(id);

        expect(p.snapshotSupply).to.equal(
            cfd("1100")
        );

        expect(p.quorumRequired).to.equal(
            cfd("220")
        );

        expect(
            await f.governance.getVotingWeight(
                id,
                f.charlie.address
            )
        ).to.equal(0n);
    });

    // ============================================================
    // QUORUM, MAJORITÉ ET DÉLAIS
    // ============================================================

    it("reste Active avant la fin même si le quorum et la majorité sont atteints", async function () {
        const { id } = await propose();

        await cast(id, f.alice, true);

        expect(
            await f.governance.getProposalState(id)
        ).to.equal(
            STATE.Active
        );

        await expect(
            f.governance.executeProposal(id)
        ).to.be.revertedWith(
            "Voting period not ended"
        );
    });

    it("rejette un vote sans quorum même si toutes les voix exprimées sont pour", async function () {
        const { id } = await propose();

        // Bob possède 100 CFD ; le quorum exige 220 CFD.
        await cast(id, f.bob, true);
        await endVote(id);

        expect(
            await f.governance.getProposalState(id)
        ).to.equal(
            STATE.Defeated
        );

        await reachExecution(id);

        await expect(
            f.governance.executeProposal(id)
        ).to.be.revertedWith(
            "Proposal not succeeded"
        );
    });

    it("rejette une majorité contre malgré un quorum atteint", async function () {
        const { id } = await propose();

        await cast(id, f.alice, false);
        await cast(id, f.bob, true);
        await endVote(id);

        expect(
            await f.governance.getProposalState(id)
        ).to.equal(
            STATE.Defeated
        );
    });

    it("rejette une égalité même avec quorum", async function () {
        // Avant la proposition :
        // Alice passe de 1000 à 550 CFD.
        // Bob passe de 100 à 550 CFD.
        await (
            await f.token
                .connect(f.alice)
                .transfer(
                    f.bob.address,
                    cfd("450")
                )
        ).wait();

        const { id } = await propose();

        await cast(id, f.alice, true);
        await cast(id, f.bob, false);
        await endVote(id);

        expect(
            await f.governance.getProposalState(id)
        ).to.equal(
            STATE.Defeated
        );
    });

    it("adopte la proposition après la fin avec quorum et majorité", async function () {
        const { id } = await propose();

        await cast(id, f.alice, true);
        await cast(id, f.bob, false);
        await endVote(id);

        expect(
            await f.governance.getProposalState(id)
        ).to.equal(
            STATE.Succeeded
        );
    });

    it("refuse de voter à la fin de la période", async function () {
        const { id } = await propose();

        await endVote(id);

        await expect(
            f.governance
                .connect(f.alice)
                .vote(id, true)
        ).to.be.revertedWith(
            "Voting period ended"
        );
    });

    it("refuse d'exécuter pendant le délai supplémentaire", async function () {
        const { id } = await propose();

        await cast(id, f.alice, true);
        await endVote(id);

        await expect(
            f.governance.executeProposal(id)
        ).to.be.revertedWith(
            "Execution delay not elapsed"
        );
    });

    // ============================================================
    // GEL ET DÉGEL
    // ============================================================

    it("exécute le gel via Crowdfunding et refuse une seconde exécution", async function () {
        const { id } = await propose();

        await cast(id, f.alice, true);
        await reachExecution(id);

        await expect(
            f.governance
                .connect(f.outsider)
                .executeProposal(id)
        )
            .to.emit(
                f.governance,
                "ProposalExecuted"
            )
            .withArgs(id);

        expect(
            (
                await f.crowdfunding.campaigns(
                    f.campaignId
                )
            ).isFrozen
        ).to.equal(true);

        expect(
            await f.governance.getProposalState(id)
        ).to.equal(
            STATE.Executed
        );

        await expect(
            f.governance.executeProposal(id)
        ).to.be.revertedWith(
            "Already executed"
        );
    });

    it("refuse le dégel d'une campagne non gelée", async function () {
        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(
                    f.campaignId,
                    TYPE.Unfreeze
                )
        ).to.be.revertedWith(
            "Campaign not frozen"
        );
    });

    it("refuse un gel redondant et permet de voter puis exécuter le dégel", async function () {
        await adoptAndExecute(TYPE.Freeze);

        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(
                    f.campaignId,
                    TYPE.Freeze
                )
        ).to.be.revertedWith(
            "Campaign already frozen"
        );

        await adoptAndExecute(TYPE.Unfreeze);

        expect(
            (
                await f.crowdfunding.campaigns(
                    f.campaignId
                )
            ).isFrozen
        ).to.equal(false);
    });

    it("revalide l'état à l'exécution et ne marque pas un échec comme exécuté", async function () {
        const a = await propose();
        const b = await propose();

        await cast(a.id, f.alice, true);
        await cast(b.id, f.alice, true);

        await reachExecution(b.id);

        await (
            await f.governance.executeProposal(a.id)
        ).wait();

        // La campagne est déjà gelée par la première proposition.
        await expect(
            f.governance.executeProposal(b.id)
        ).to.be.revertedWith(
            "Campaign already frozen"
        );

        // La transaction ayant échoué, executed doit rester false.
        expect(
            (await f.governance.proposals(b.id)).executed
        ).to.equal(false);
    });

    // ============================================================
    // ANNULATION
    // ============================================================

    it("annule une campagne active après un vote adopté", async function () {
        await adoptAndExecute(TYPE.Cancel);

        expect(
            (
                await f.crowdfunding.campaigns(
                    f.campaignId
                )
            ).status
        ).to.equal(3n);

        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(
                    f.campaignId,
                    TYPE.Freeze
                )
        ).to.be.revertedWith(
            "Campaign is final"
        );
    });

    it("refuse une annulation proposée après l'échéance", async function () {
        const campaign =
            await f.crowdfunding.campaigns(
                f.campaignId
            );

        await networkHelpers.time.increaseTo(
            campaign.deadline + 1n
        );

        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(
                    f.campaignId,
                    TYPE.Cancel
                )
        ).to.be.revertedWith(
            "Campaign already ended"
        );
    });

    it("refuse une annulation dont l'exécution arrive après l'échéance", async function () {
        // Campagne d'un jour : elle se termine avant les 4 jours
        // nécessaires au vote et au délai d'exécution.
        await (
            await f.crowdfunding.createCampaign(
                eth("10"),
                DAY,
                f.beneficiary.address,
                CID
            )
        ).wait();

        const campaignId =
            await f.crowdfunding.campaignCount();

        await (
            await f.crowdfunding
                .connect(f.alice)
                .contribute(
                    campaignId,
                    { value: eth("0.1") }
                )
        ).wait();

        const { id } = await propose(
            TYPE.Cancel,
            f.alice,
            campaignId
        );

        await cast(id, f.alice, true);
        await reachExecution(id);

        await expect(
            f.governance.executeProposal(id)
        ).to.be.revertedWith(
            "Campaign already ended"
        );

        expect(
            (await f.governance.proposals(id)).executed
        ).to.equal(false);
    });

    // ============================================================
    // AUTORISATION DE RETRAIT
    // ============================================================

    it("refuse une proposition de retrait si la campagne n'est pas réussie", async function () {
        await expect(
            f.governance
                .connect(f.beneficiary)
                .createProposal(
                    f.campaignId,
                    TYPE.Withdrawal
                )
        ).to.be.revertedWith(
            "Campaign not successful"
        );
    });

    it("exige une demande de retrait avant la proposition", async function () {
        await (
            await f.crowdfunding.createCampaign(
                eth("0.1"),
                DAY,
                f.beneficiary.address,
                CID
            )
        ).wait();

        const campaignId =
            await f.crowdfunding.campaignCount();

        await (
            await f.crowdfunding
                .connect(f.alice)
                .contribute(
                    campaignId,
                    { value: eth("0.1") }
                )
        ).wait();

        const campaign =
            await f.crowdfunding.campaigns(
                campaignId
            );

        await networkHelpers.time.increaseTo(
            campaign.deadline + 1n
        );

        await (
            await f.crowdfunding.finalizeCampaign(
                campaignId
            )
        ).wait();

        // La campagne est Successful,
        // mais le bénéficiaire n'a pas demandé le retrait.
        await expect(
            f.governance
                .connect(f.beneficiary)
                .createProposal(
                    campaignId,
                    TYPE.Withdrawal
                )
        ).to.be.revertedWith(
            "No withdrawal requested"
        );
    });

    it("réserve la proposition de retrait au bénéficiaire même sans CFD", async function () {
        const campaignId =
            await prepareWithdrawal();

        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(
                    campaignId,
                    TYPE.Withdrawal
                )
        ).to.be.revertedWith(
            "Only beneficiary"
        );

        const { id } = await propose(
            TYPE.Withdrawal,
            f.beneficiary,
            campaignId
        );

        expect(
            (await f.governance.proposals(id)).proposer
        ).to.equal(
            f.beneficiary.address
        );

        expect(
            await f.governance.getVotingWeight(
                id,
                f.beneficiary.address
            )
        ).to.equal(0n);

        // Le droit de proposer le retrait ne donne pas de voix.
        await expect(
            f.governance
                .connect(f.beneficiary)
                .vote(id, true)
        ).to.be.revertedWith(
            "No voting power"
        );
    });

    it("autorise le retrait adopté et refuse une nouvelle autorisation", async function () {
        const campaignId =
            await prepareWithdrawal();

        await adoptAndExecute(
            TYPE.Withdrawal,
            campaignId,
            f.beneficiary
        );

        expect(
            (
                await f.crowdfunding.withdrawals(
                    campaignId
                )
            ).governanceApproved
        ).to.equal(true);

        await expect(
            f.governance
                .connect(f.beneficiary)
                .createProposal(
                    campaignId,
                    TYPE.Withdrawal
                )
        ).to.be.revertedWith(
            "Withdrawal already authorized"
        );
    });

    it("refuse les propositions et votes après le paiement final", async function () {
        const campaignId =
            await prepareWithdrawal();

        await adoptAndExecute(
            TYPE.Withdrawal,
            campaignId,
            f.beneficiary
        );

        // Cette proposition est encore ouverte au moment du paiement.
        const pending = await propose(
            TYPE.Freeze,
            f.alice,
            campaignId
        );

        await (
            await f.crowdfunding
                .connect(f.beneficiary)
                .withdrawFunds(campaignId)
        ).wait();

        await expect(
            f.governance
                .connect(f.alice)
                .createProposal(
                    campaignId,
                    TYPE.Freeze
                )
        ).to.be.revertedWith(
            "Campaign already paid"
        );

        await expect(
            f.governance
                .connect(f.alice)
                .vote(pending.id, true)
        ).to.be.revertedWith(
            "Campaign already paid"
        );
    });

    // ============================================================
    // IDENTIFIANTS INVALIDES
    // ============================================================

    it("refuse les identifiants de proposition inexistants", async function () {
        for (const id of [0n, 999n]) {
            await expect(
                f.governance.proposals(id)
            ).to.be.revertedWith(
                "Proposal does not exist"
            );

            await expect(
                f.governance.getProposalState(id)
            ).to.be.revertedWith(
                "Proposal does not exist"
            );

            await expect(
                f.governance.getVotingWeight(
                    id,
                    f.alice.address
                )
            ).to.be.revertedWith(
                "Proposal does not exist"
            );

            await expect(
                f.governance.getParticipation(id)
            ).to.be.revertedWith(
                "Proposal does not exist"
            );

            await expect(
                f.governance
                    .connect(f.alice)
                    .vote(id, true)
            ).to.be.revertedWith(
                "Proposal does not exist"
            );

            await expect(
                f.governance.executeProposal(id)
            ).to.be.revertedWith(
                "Proposal does not exist"
            );
        }
    });
});