// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// AccessControl : gestion des rôles (admin).
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
// ReentrancyGuard : protection contre la réentrance.
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Interface minimale vers Crowdfunding
 * @dev   Governance a besoin de :
 *        - lire l'adresse du token d'une campagne (pour les votes) ;
 *        - appeler authorizeWithdrawal, setFrozen, cancelCampaign.
 */
interface ICrowdfunding {
    function campaigns(uint256 campaignId) external view returns (
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
    function authorizeWithdrawal(uint256 campaignId) external;
    function setFrozen(uint256 campaignId, bool frozen) external;
    function cancelCampaign(uint256 campaignId) external;
}

/**
 * @title Interface minimale vers CFDToken (ERC20Votes)
 * @dev   Governance a besoin de lire le pouvoir de vote au snapshot.
 */
interface ICFDTokenVotes {
    function getPastVotes(address account, uint256 blockNumber) external view returns (uint256);
    function getPastTotalSupply(uint256 blockNumber) external view returns (uint256);
}

/**
 * @title Governance
 * @notice Gère les propositions et les votes pondérés par les CFD.
 *         Les décisions sont exécutées en appelant Crowdfunding.
 * @dev    Suit les règles définies dans Conception.md.
 */
contract Governance is AccessControl, ReentrancyGuard {

    // RÔLES

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // CONSTANTES / CONFIG

    /// @notice Quorum : 20% des CFD en circulation (2000 BPS = 20%).
    uint256 public constant QUORUM_BPS = 2000;
    /// @notice Dénominateur des BPS : 10000 = 100%.
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Durée du vote : 3 jours.
    uint256 public constant VOTING_PERIOD = 3 days;

    // STRUCTURES

    enum ProposalType {
        Withdrawal,    // Autoriser un retrait
        Freeze,        // Geler une campagne
        Unfreeze,      // Dégeler une campagne
        Cancel         // Annuler une campagne
    }

    enum ProposalState {
        Active,        // Vote en cours
        Succeeded,     // Adoptée (quorum + majorité)
        Defeated,      // Rejetée (quorum non atteint ou majorité contre)
        Executed       // Exécutée
    }

    struct Proposal {
        uint256 campaignId;       // Campagne concernée
        ProposalType proposalType;
        address proposer;         // Qui a créé la proposition
        uint256 createdAt;        // Timestamp de création
        uint256 deadline;         // Fin du vote
        uint256 snapshotBlock;    // Bloc du snapshot (pour getPastVotes)
        uint256 forVotes;         // Total des votes "pour"
        uint256 againstVotes;     // Total des votes "contre"
        bool executed;            // true si exécutée
        mapping(address => bool) hasVoted; // Protection contre le vote multiple
    }

    // VARIABLES D'ÉTAT

    /// @notice Compteur de propositions.
    uint256 public proposalCount;

    /// @notice proposalId => Proposal
    mapping(uint256 => Proposal) public proposals;

    /// @notice Adresse du contrat Crowdfunding.
    ICrowdfunding public crowdfunding;

    // ÉVÉNEMENTS

    event ProposalCreated(
        uint256 indexed proposalId,
        uint256 indexed campaignId,
        ProposalType proposalType,
        address indexed proposer,
        uint256 deadline,
        uint256 snapshotBlock
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight
    );

    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalDefeated(uint256 indexed proposalId, string reason);

    // CONSTRUCTEUR

    /**
     * @param admin Adresse qui reçoit les rôles d'administration.
     * @param _crowdfunding Adresse du contrat Crowdfunding.
     */
    constructor(address admin, address _crowdfunding) {
        require(admin != address(0), "Admin zero address");
        require(_crowdfunding != address(0), "Crowdfunding zero address");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        crowdfunding = ICrowdfunding(_crowdfunding);
    }

    //                    FONCTIONS DE PROPOSITION

    /**
     * @notice Crée une proposition.
     * @param campaignId Identifiant de la campagne.
     * @param proposalType Type de proposition.
     * @dev    Conditions :
     *         - le proposer doit avoir des CFD de la campagne (sauf pour Withdrawal, où le bénéficiaire peut proposer sans CFD) ;
     *         - le snapshot est pris au bloc actuel.
     */
    function createProposal(uint256 campaignId, ProposalType proposalType)
        external
        returns (uint256 proposalId)
    {
        // Vérifier que la campagne existe
        (, address beneficiary, , , , , , , , address token, , , ) = crowdfunding.campaigns(campaignId);
        require(token != address(0), "Campaign does not exist");
        // (, valeur,,,,,, valeur,,,) :  C'est une destructuration de tuple (tuple destructuring). 
        //  C'est une façon d'ignorer certaines valeurs retournées par une fonction, et de ne récupérer que celles qui nous intéressent.

        // Vérifier les droits du proposer
        if (proposalType == ProposalType.Withdrawal) {
            // Pour un retrait : seul le bénéficiaire peut proposer.
            require(msg.sender == beneficiary, "Only beneficiary");
        } else {
            // Pour les autres : il faut avoir des CFD de la campagne.
            uint256 balance = ICFDTokenVotes(token).getPastVotes(msg.sender, block.number - 1);
            require(balance > 0, "No CFD");
        }

        // Créer la proposition
        proposalCount += 1;
        proposalId = proposalCount;

        Proposal storage p = proposals[proposalId];
        p.campaignId = campaignId;
        p.proposalType = proposalType;
        p.proposer = msg.sender;
        p.createdAt = block.timestamp;
        p.deadline = block.timestamp + VOTING_PERIOD;
        p.snapshotBlock = block.number; // Snapshot au bloc actuel
        p.forVotes = 0;
        p.againstVotes = 0;
        p.executed = false;

        emit ProposalCreated(proposalId, campaignId, proposalType, msg.sender, p.deadline, p.snapshotBlock);
    }

    //                    FONCTIONS DE VOTE

    /**
     * @notice Vote pour ou contre une proposition.
     * @param proposalId Identifiant de la proposition.
     * @param support true = pour, false = contre.
     */
    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(p.proposer != address(0), "Proposal does not exist");
        require(block.timestamp < p.deadline, "Voting period ended");
        require(!p.hasVoted[msg.sender], "Already voted");

        // Récupérer le token de la campagne
        (, , , , , , , , , address token, , , ) = crowdfunding.campaigns(p.campaignId);
        require(token != address(0), "Campaign does not exist");

        // Lire le pouvoir de vote au snapshot
        uint256 weight = ICFDTokenVotes(token).getPastVotes(msg.sender, p.snapshotBlock);
        require(weight > 0, "No voting power");

        // Enregistrer le vote
        p.hasVoted[msg.sender] = true;
        if (support) {
            p.forVotes += weight;
        } else {
            p.againstVotes += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    //                    FONCTIONS D'EXÉCUTION

    /**
     * @notice Exécute une proposition si elle est adoptée.
     * @param proposalId Identifiant de la proposition.
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.proposer != address(0), "Proposal does not exist");
        require(!p.executed, "Already executed");
        require(block.timestamp >= p.deadline, "Voting period not ended");

        // Vérifier l'état
        ProposalState state = getProposalState(proposalId);
        require(state == ProposalState.Succeeded, "Proposal not succeeded");

        // Marquer comme exécutée AVANT l'appel externe (Checks-Effects-Interactions)
        p.executed = true;

        // Appeler Crowdfunding selon le type
        if (p.proposalType == ProposalType.Withdrawal) {
            crowdfunding.authorizeWithdrawal(p.campaignId);
        } else if (p.proposalType == ProposalType.Freeze) {
            crowdfunding.setFrozen(p.campaignId, true);
        } else if (p.proposalType == ProposalType.Unfreeze) {
            crowdfunding.setFrozen(p.campaignId, false);
        } else if (p.proposalType == ProposalType.Cancel) {
            crowdfunding.cancelCampaign(p.campaignId);
        }

        emit ProposalExecuted(proposalId);
    }

    //                    FONCTIONS DE LECTURE

    /**
     * @notice Retourne l'état d'une proposition.
     * @param proposalId Identifiant de la proposition.
     */
    function getProposalState(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage p = proposals[proposalId];
        require(p.proposer != address(0), "Proposal does not exist");

        if (p.executed) {
            return ProposalState.Executed;
        }

        if (block.timestamp < p.deadline) {
            return ProposalState.Active;
        }

        // Calculer le quorum
        (, , , , , , , , , address token, , , ) = crowdfunding.campaigns(p.campaignId);
        uint256 totalSupply = ICFDTokenVotes(token).getPastTotalSupply(p.snapshotBlock);
        uint256 quorum = (totalSupply * QUORUM_BPS) / BPS_DENOMINATOR;

        uint256 totalVotes = p.forVotes + p.againstVotes;

        // Vérifier le quorum
        if (totalVotes < quorum) {
            return ProposalState.Defeated;
        }

        // Vérifier la majorité
        if (p.forVotes > p.againstVotes) {
            return ProposalState.Succeeded;
        } else {
            return ProposalState.Defeated;
        }
    }
}