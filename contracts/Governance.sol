// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";

import {ReentrancyGuard} from
    "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @notice Interface vers notre contrat Crowdfunding.
 *
 * L'ordre des valeurs retournées par campaigns() doit correspondre
 * à celui de la structure Campaign dans Crowdfunding.sol.
 */
interface ICrowdfunding {
    function campaigns(uint256 campaignId)
        external
        view
        returns (
            address creator,
            address beneficiary,
            uint256 goal,
            uint256 deadline,
            uint256 totalRaised,
            uint256 availableFunds,
            uint256 totalRefunded,
            uint256 totalWithdrawn,
            string memory ipfsHash,
            address token,
            uint8 status,
            bool fundsWithdrawn,
            bool isFrozen
        );

    function withdrawals(uint256 campaignId)
        external
        view
        returns (
            uint256 grossAmount,
            uint256 feeAmount,
            uint256 netAmount,
            bool requested,
            bool governanceApproved,
            bool multisigApproved
        );

    function authorizeWithdrawal(uint256 campaignId) external;

    function setFrozen(
        uint256 campaignId,
        bool frozen
    ) external;

    function cancelCampaign(uint256 campaignId) external;

    // Horloge logique du Crowdfunding : ne compte pas les pauses d'urgence.
    function effectiveTime() external view returns (uint256);
}

/**
 * @notice Lectures historiques nécessaires sur le token de campagne.
 */
interface ICFDTokenVotes {
    function getPastVotes(
        address account,
        uint256 blockNumber
    ) external view returns (uint256); //le nombre de voix qu'une adresse possédait à un bloc antérieur.

    function getPastTotalSupply(
        uint256 blockNumber
    ) external view returns (uint256); //le nombre total d'unités CFD en circulation à ce bloc.
}
// Imaginons qu'Alice possédait 1 000 CFD au bloc 500 et qu'elle les transfère ensuite à Bob au bloc 510.
// Si le snapshot de la proposition correspond au bloc 500, le pouvoir de vote reste basé sur la situation à ce bloc :


/**
 * @title Governance
 * @notice Gouvernance propre à chaque campagne, pondérée par les CFD.
 *
 * Règles :
 * - un token distinct par campagne ;
 * - poids et quorum calculés sur le même bloc historique ;
 * - une adresse vote une seule fois par proposition ;
 * - quorum de 20 % des petites unités CFD au snapshot ;
 * - majorité stricte : pour > contre ;
 * - vote pendant 3 jours ;
 * - exécution après 1 jour supplémentaire ;
 * - aucun administrateur ne peut modifier les résultats.
 *
 * Les décisions appellent Crowdfunding.
 * Elles ne transfèrent pas directement les fonds.
 */
contract Governance is AccessControl, ReentrancyGuard {
    // =============================================================
    //                        CONFIGURATION
    // =============================================================
    // public c-a-d consultable depuis lexterieur du contrat et constant signifie que la valeur est connue à la compilation et ne peut pas être mondifiée pendant l exécution
    uint256 public constant QUORUM_BPS = 2000; // 20% (représente la participation minimale c-a-d on doit avoir au minimum 20% de nombre de CFD global)
    uint256 public constant BPS_DENOMINATOR = 10_000;

    uint256 public constant VOTING_PERIOD = 3 days; // les participant dispose 3 jours pour voter
    uint256 public constant EXECUTION_DELAY = 1 days;// une journée d'attente après la période de vote

    ICrowdfunding public immutable crowdfunding;//cette variable conserve l adresse du contrat crowfunding sous forme d interface immutable signifie que l adresse est definie au deploiement et ne peut pas etre changée

    // =============================================================
    //                            TYPES
    // =============================================================

    enum ProposalType {
        Withdrawal, // autorise un retrait
        Freeze,  // geler une campagne
        Unfreeze, // dégeler une campagne
        Cancel // annuler une campagne
    }

    // l etat du vote

    enum ProposalState {
        Active,  // la periode du vote est encore ouverte
        Succeeded, // la ^eriode est termine et la majorite est pour
        Defeated, // la proposition n'a pas satisfait les conditions d adoption
        Executed // la decision à déjà été appliquée
    }
    // une proposition peut etre succeded et non exécutable puisque nous imposons aussi un délai supp d un jour

    /**
     * @dev Aucun mapping dans cette structure :
     * elle peut être renvoyée intégralement par une fonction de lecture.
     */

     /struct regroupe plusieurs variables qui décrivent un objet 
    struct Proposal {
        uint256 campaignId; //exemple 1
        ProposalType proposalType;// exemple freez

        address proposer;// exemple alice
        address token; // CFD-1

        uint256 createdAt; // 
        uint256 deadline;
        uint256 executableAt;

        uint256 snapshotBlock; // bloc 500
        uint256 snapshotSupply;// 2000cfd
        uint256 quorumRequired;// 400 cfd(20% de total des cfd)

        uint256 forVotes;// 1500 pour
        uint256 againstVotes; // 500 contre

        // pour respecter le quorum il faut que (500+1500>=400)
        bool executed;// déjà exécuté true or false
    }

    /**
     * @dev Informations de campagne utilisées par la gouvernance.
     */
    struct CampaignInfo {
        address creator;
        address beneficiary;
        uint256 deadline;
        address token;
        uint8 status; // le status déclaré dans crowfunding 0 pour active 1 pour successful 2 pour failed 3 pour cancelled
        bool fundsWithdrawn;
        bool isFrozen;
    }

    // =============================================================
    //                          STOCKAGE
    // =============================================================

    uint256 public proposalCount; // compte les propositions crées et il génère leurs identifiant

    /**
     * @dev Stockage privé avec lecture explicite plus bas.
     * Cela évite un getter automatique renvoyant trop de valeurs.
     */
    mapping(uint256 => Proposal) private _proposals;//_proposals associe un identifiant à sa proposition

    /// @notice proposition => adresse => a déjà voté.
    mapping(uint256 => mapping(address => bool))
        public hasVoted;

    // =============================================================
    //                         ÉVÉNEMENTS
    // =============================================================
    // lorqu'une proposition est créée
    event ProposalCreated(
        uint256 indexed proposalId,// identifiant unique pour chaque proposition (parce qu'une meme campagne peut avoir plusieurs propositions)
        uint256 indexed campaignId,// l identifiant de la campagne concernée par la proposition
        ProposalType proposalType, // le type de la proposition on a déja déclarée 4 types
        address indexed proposer, // c est l adresse de la personne qui a créé la proposition
        uint256 deadline,// date limite de vote 
        uint256 snapshotBlock // c est le bloc servant de reference pour calculer le pouvoir de vote historique
    );
    //lorsqu'un utilisateur vote.
    event VoteCast(
        uint256 indexed proposalId,//l id de la proposition
        address indexed voter,//adresse de la personne qui vote
        bool support,//sens du vote (true signifie pour et false signifie contre)
        uint256 weight // le poid du vote (par exemple 100cfd)
    );
    //lorsqu'une proposition approuvée est exécutée.
    event ProposalExecuted(
        uint256 indexed proposalId
    );
    // cest trois événement permettent de suivre tout le cycle de vie d'une proposition de gouvernance, depuis sa création jusqu à son exécution

    // =============================================================
    //                         CONSTRUCTEUR
    // =============================================================

    /**
     * @param admin Administrateur des rôles de ce contrat.
     * @param crowdfundingAddress Adresse du contrat Crowdfunding.
     *
     * @dev Le rôle administrateur ne donne ici aucun pouvoir
     * pour voter à la place des détenteurs, modifier les résultats
     * ou contourner les conditions d'exécution.
     */
     // le constucteur s'exécute une seule fois, lors du démloiement du contrat il reçoit deux addresses admin et le contrat crowfunding
    constructor(
        address admin,
        address crowdfundingAddress
    ) {
        require(
            admin != address(0),
            "Admin zero address"
        );

        require(
            "Crowdfunding zero address"
        );

        require(
            crowdfundingAddress.code.length > 0,//Elle vérifie qu'un code de smart contract existe à cette adresse au moment du déploiement.
            "Crowdfunding must be a contract"
        );

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        crowdfunding =
            ICrowdfunding(crowdfundingAddress);//enregistre la référence qui sera utilisée par toutes les fonctions de gouvernance.
    }

    // =============================================================
    //                    CRÉATION DES PROPOSITIONS
    // =============================================================

    /**
     * @notice Crée une proposition pour une campagne.
     *
     * @dev Retrait :
     * seul le bénéficiaire peut proposer et la demande financière
     * doit déjà exister dans Crowdfunding.
     *
     * Autres actions :
     * le proposant doit avoir des voix au snapshot de la campagne.
     */
    function createProposal(
        uint256 campaignId,
        ProposalType proposalType
    )
        external
        returns (uint256 proposalId)
    {
        CampaignInfo memory campaign =
            _readCampaign(campaignId);

        _validateAction(
            campaignId,
            proposalType,
            campaign
        );

        require(
            block.number > 0,
            "No past block"
        );

        uint256 snapshotBlock = block.number - 1;

        ICFDTokenVotes token =
            ICFDTokenVotes(campaign.token);

        uint256 snapshotSupply =
            token.getPastTotalSupply(snapshotBlock);

        require(
            snapshotSupply > 0,
            "No CFD at snapshot"
        );

        if (
            proposalType == ProposalType.Withdrawal
        ) {
            require(
                msg.sender == campaign.beneficiary,
                "Only beneficiary"
            );
        } else {
            uint256 proposerWeight =
                token.getPastVotes(
                    msg.sender,
                    snapshotBlock
                );

            require(
                proposerWeight > 0,
                "No CFD at snapshot"
            );
        }

        // Notre CFDToken utilise ERC20Votes, dont l'offre
        // tient dans 208 bits. Ce contrôle explicite protège
        // aussi le calcul du quorum contre une offre inattendue.
        require(
            snapshotSupply <= type(uint208).max,
            "Unexpected token supply"
        );

        // Arrondi vers le haut.
        uint256 quorumRequired = (
            snapshotSupply * QUORUM_BPS
            + BPS_DENOMINATOR - 1
        ) / BPS_DENOMINATOR;

        proposalCount += 1;
        proposalId = proposalCount;

        Proposal storage p =
            _proposals[proposalId];

        p.campaignId = campaignId;
        p.proposalType = proposalType;

        p.proposer = msg.sender;
        p.token = campaign.token;

        p.createdAt = block.timestamp;
        p.deadline =
            block.timestamp + VOTING_PERIOD;

        p.executableAt =
            p.deadline + EXECUTION_DELAY;

        p.snapshotBlock = snapshotBlock;
        p.snapshotSupply = snapshotSupply;
        p.quorumRequired = quorumRequired;

        // Les compteurs et executed sont initialement à zéro/false.

        emit ProposalCreated(
            proposalId,
            campaignId,
            proposalType,
            msg.sender,
            p.deadline,
            snapshotBlock
        );
    }

    // =============================================================
    //                              VOTE
    // =============================================================

    /**
     * @notice Vote pour ou contre avec le poids historique.
     * @param support true = pour ; false = contre.
     *
     * Les jetons ne sont ni dépensés ni détruits pour voter.
     */
    function vote(
        uint256 proposalId,
        bool support
    ) external {
        _requireProposalExists(proposalId);

        Proposal storage p =
            _proposals[proposalId];

        require(
            !p.executed,
            "Already executed"
        );

        require(
            block.timestamp < p.deadline,
            "Voting period ended"
        );

        require(
            !hasVoted[proposalId][msg.sender],
            "Already voted"
        );

        CampaignInfo memory campaign =
            _readCampaign(p.campaignId);

        _requireCampaignOpen(campaign);

        require(
            campaign.token == p.token,
            "Campaign token changed"
        );

        uint256 weight =
            ICFDTokenVotes(p.token).getPastVotes(
                msg.sender,
                p.snapshotBlock
            );

        require(
            weight > 0,
            "No voting power"
        );

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            p.forVotes += weight;
        } else {
            p.againstVotes += weight;
        }

        emit VoteCast(
            proposalId,
            msg.sender,
            support,
            weight
        );
    }

    // =============================================================
    //                           EXÉCUTION
    // =============================================================

    /**
     * @notice Exécute une décision adoptée après le délai d'attente.
     *
     * @dev Tout le monde peut déclencher l'exécution.
     * Le résultat du vote et les conditions de campagne
     * déterminent ce qui est autorisé, pas l'identité du déclencheur.
     */
    function executeProposal(
        uint256 proposalId
    )
        external
        nonReentrant
    {
        _requireProposalExists(proposalId);

        Proposal storage p =
            _proposals[proposalId];

        require(
            !p.executed,
            "Already executed"
        );

        require(
            block.timestamp >= p.deadline,
            "Voting period not ended"
        );

        require(
            block.timestamp >= p.executableAt,
            "Execution delay not elapsed"
        );

        require(
            getProposalState(proposalId) ==
                ProposalState.Succeeded,
            "Proposal not succeeded"
        );

        CampaignInfo memory campaign =
            _readCampaign(p.campaignId);

        require(
            campaign.token == p.token,
            "Campaign token changed"
        );

        // Les conditions ont pu changer pendant le vote.
        _validateAction(
            p.campaignId,
            p.proposalType,
            campaign
        );

        // Si Crowdfunding refuse l'action, le revert
        // annulera aussi ce passage à true.
        p.executed = true;

        if (
            p.proposalType ==
            ProposalType.Withdrawal
        ) {
            crowdfunding.authorizeWithdrawal(
                p.campaignId
            );
        } else if (
            p.proposalType ==
            ProposalType.Freeze
        ) {
            crowdfunding.setFrozen(
                p.campaignId,
                true
            );
        } else if (
            p.proposalType ==
            ProposalType.Unfreeze
        ) {
            crowdfunding.setFrozen(
                p.campaignId,
                false
            );
        } else {
            crowdfunding.cancelCampaign(
                p.campaignId
            );
        }

        emit ProposalExecuted(proposalId);
    }

    // =============================================================
    //                             LECTURES
    // =============================================================

    /**
     * @notice Retourne toutes les données d'une proposition.
     */
    function proposals(uint256 proposalId)
        external
        view
        returns (Proposal memory)
    {
        _requireProposalExists(proposalId);

        return _proposals[proposalId];
    }

    /**
     * @notice Retourne le résultat du vote.
     *
     * Succeeded signifie que le vote est adopté.
     * L'action peut néanmoins devenir inexécutable si les
     * conditions de la campagne changent ensuite.
     */
    function getProposalState(
        uint256 proposalId
    )
        public
        view
        returns (ProposalState)
    {
        _requireProposalExists(proposalId);

        Proposal storage p =
            _proposals[proposalId];

        if (p.executed) {
            return ProposalState.Executed;
        }

        if (block.timestamp < p.deadline) {
            return ProposalState.Active;
        }

        uint256 totalVotes =
            p.forVotes + p.againstVotes;

        if (
            totalVotes < p.quorumRequired
        ) {
            return ProposalState.Defeated;
        }

        // Égalité ou majorité contre : rejet.
        if (
            p.forVotes <= p.againstVotes
        ) {
            return ProposalState.Defeated;
        }

        return ProposalState.Succeeded;
    }

    /**
     * @notice Poids d'une adresse pour cette proposition.
     */
    function getVotingWeight(
        uint256 proposalId,
        address voter
    )
        external
        view
        returns (uint256)
    {
        _requireProposalExists(proposalId);

        Proposal storage p =
            _proposals[proposalId];

        return
            ICFDTokenVotes(p.token).getPastVotes(
                voter,
                p.snapshotBlock
            );
    }

    /**
     * @notice Participation totale, en petites unités CFD.
     */
    function getParticipation(
        uint256 proposalId
    )
        external
        view
        returns (uint256)
    {
        _requireProposalExists(proposalId);

        Proposal storage p =
            _proposals[proposalId];

        return p.forVotes + p.againstVotes;
    }

    // =============================================================
    //                     CONTRÔLES INTERNES
    // =============================================================

    function _requireProposalExists(
        uint256 proposalId
    ) internal view {
        require(
            proposalId > 0 &&
            proposalId <= proposalCount,
            "Proposal does not exist"
        );
    }

    /**
     * @dev Refuse les campagnes inexistantes, payées,
     * échouées ou annulées.
     */
    function _requireCampaignOpen(
        CampaignInfo memory campaign
    ) internal pure {
        require(
            campaign.creator != address(0) &&
            campaign.token != address(0),
            "Campaign does not exist"
        );

        require(
            !campaign.fundsWithdrawn,
            "Campaign already paid"
        );

        // CampaignStatus de Crowdfunding :
        // 0 = Active ; 1 = Successful ;
        // 2 = Failed ; 3 = Cancelled.
        require(
            campaign.status == 0 ||
            campaign.status == 1,
            "Campaign is final"
        );
    }

    /**
     * @dev Contrôles spécifiques à la décision.
     * Utilisés à la création et à l'exécution.
     */
    function _validateAction(
        uint256 campaignId,
        ProposalType proposalType,
        CampaignInfo memory campaign
    ) internal view {
        _requireCampaignOpen(campaign);

        if (
            proposalType ==
            ProposalType.Withdrawal
        ) {
            require(
                campaign.status == 1,
                "Campaign not successful"
            );

            require(
                !campaign.isFrozen,
                "Campaign is frozen"
            );

            _requireWithdrawalPending(campaignId);
        } else if (
            proposalType ==
            ProposalType.Freeze
        ) {
            require(
                !campaign.isFrozen,
                "Campaign already frozen"
            );
        } else if (
            proposalType ==
            ProposalType.Unfreeze
        ) {
            require(
                campaign.isFrozen,
                "Campaign not frozen"
            );
        } else {
            // Compatible avec cancelCampaign actuellement fourni.
            require(
                campaign.status == 0,
                "Campaign not active"
            );

            require(
                crowdfunding.effectiveTime() < campaign.deadline,
                "Campaign already ended"
            );
        }
    }

    /**
     * @dev Une proposition de retrait doit concerner
     * une demande déjà créée et pas encore autorisée.
     */
    function _requireWithdrawalPending(
        uint256 campaignId
    ) internal view {
        (
            ,
            ,
            ,
            bool requested,
            bool governanceApproved,

        ) = crowdfunding.withdrawals(campaignId);

        require(
            requested,
            "No withdrawal requested"
        );

        require(
            !governanceApproved,
            "Withdrawal already authorized"
        );
    }

    /**
     * @dev Lecture partielle des treize champs retournés
     * par le getter campaigns() de notre Crowdfunding.
     */
    function _readCampaign(
        uint256 campaignId
    )
        internal
        view
        returns (CampaignInfo memory info)
    {
        (
            info.creator,
            info.beneficiary,
            ,
            info.deadline,
            ,
            ,
            ,
            ,
            ,
            info.token,
            info.status,
            info.fundsWithdrawn,
            info.isFrozen
        ) = crowdfunding.campaigns(campaignId);
    }
}