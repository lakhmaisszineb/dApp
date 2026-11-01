// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Interface minimale vers le contrat CFDToken
 * @dev   On ne dépend que de la fonction mint. lauutre contrat gère le reste (ERC20Votes, snapshots...).
 */
interface ICFDToken {
    function mint(address to, uint256 amount) external;
}

/**
 * @title Crowdfunding
 * @notice Cœur de la plateforme de financement participatif décentralisée.
 *         Gère la création des campagnes, les contributions, les remboursements
 *         et les retraits conditionnés à la gouvernance + multisig.
 * @dev    Suit strictement les règles définies dans Conception.md
 */
contract Crowdfunding is AccessControl, ReentrancyGuard, Pausable {

    // RÔLES

    // keccak256("ADMIN_ROLE") : fonction de hachage cryptographique native d'Ethereum.
    // Dans OpenZeppelin AccessControl, un rôle n’est pas une chaîne de caractères ("ADMIN_ROLE"),
    // c’est un identifiant de 32 octets (bytes32). On utilise keccak256 pour créer cet identifiant
    // de façon déterministe et unique.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // CONSTANTES / CONFIG

    /// @notice Taux de conversion : 1 ETH = 1000 CFD (modifiable plus tard si besoin)
    uint256 public constant CFD_RATE = 1000; // uint256 : entier non signé (positif ou nul)

    /// @notice Seuil au-delà duquel le multisig 2-sur-3 est obligatoire (0.5 ETH)
    uint256 public constant MULTISIG_THRESHOLD = 0.5 ether; // 1 ether = 10^18 wei

    /// @notice Durée minimale et maximale d'une campagne (en secondes)
    uint256 public constant MIN_DURATION = 1 days;
    uint256 public constant MAX_DURATION = 90 days;

    // STRUCTURES

    // enum : type de donnée qui définit une liste de constantes nommées.
    enum CampaignStatus {
        Active,     // En cours
        Successful, // Réussie (objectif atteint)
        Failed,     // Échouée (objectif non atteint)
        Cancelled   // Annulée par gouvernance
    }

    // struct : comme un dict en Python ou un objet en JavaScript.
    // Conteneur qui regroupe plusieurs variables sous un même nom.
    struct Campaign {
        address creator;          // Qui a créé la campagne
        address beneficiary;      // Qui recevra les fonds
        uint256 goal;             // Objectif en wei
        uint256 deadline;         // Timestamp de fin
        uint256 totalRaised;      // Total collecté
        uint256 availableFunds;   // Fonds encore disponibles (après éventuels refunds)
        string  ipfsHash;         // CID IPFS des métadonnées
        CampaignStatus status;
        bool    fundsWithdrawn;   // true si le bénéficiaire a déjà retiré
        bool    isFrozen;         // true si gelée par gouvernance
    }

    // VARIABLES D'ÉTAT

    /// @notice Compteur d'identifiants de campagne (commence à 1)
    uint256 public campaignCount; // Chaque nouvelle campagne aura un ID unique. On l'incrémente à chaque création.

    /// @notice campaignId => Campaign
    mapping(uint256 => Campaign) public campaigns;
    // mapping : équivalent d'un dict en Python (structure clé-valeur)

    /// @notice campaignId => contributeur => montant contribué (pour le refund)
    mapping(uint256 => mapping(address => uint256)) public contributions;

    // Adresses des contrats externes
    ICFDToken public cfdToken;   // Typé avec l'interface (plus sûr que address)
    address public governance;
    address public multiSig;

    // ÉVÉNEMENTS

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address indexed beneficiary,
        uint256 goal,
        uint256 deadline,
        string ipfsHash
    );
    // indexed permet de filtrer les événements quand on les recherche.

    event Contributed(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amount,
        uint256 cfdMinted
    );

    event Refunded(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amount
    );

    event CampaignFinalized(uint256 indexed campaignId, CampaignStatus status);
    event CampaignFrozen(uint256 indexed campaignId, bool frozen);
    event FundsWithdrawn(uint256 indexed campaignId, address indexed beneficiary, uint256 amount);

    // CONSTRUCTEUR

    /**
     * @param admin     Adresse qui reçoit DEFAULT_ADMIN_ROLE et ADMIN_ROLE
     * @param _cfdToken Adresse du contrat CFDToken déjà déployé
     */
    constructor(address admin, address _cfdToken) {
        // constructor : fonction spéciale qui s'exécute une seule fois, au moment du déploiement.
        require(admin != address(0), "Admin zero address");
        require(_cfdToken != address(0), "CFDToken zero address");
        //L'adresse zéro : 0x0000000000000000000000000000000000000000. 
        //  C'est une adresse spéciale qui ne peut pas recevoir de fonds 
        // (ou plutôt, les fonds envoyés à cette adresse sont perdus à jamais).

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        cfdToken = ICFDToken(_cfdToken);
    }

    /**
     * @notice Crée une nouvelle campagne de financement.
     * @param goal Montant objectif en wei
     * @param duration Durée de la campagne en secondes
     * @param beneficiary Adresse qui recevra les fonds si la campagne réussit
     * @param ipfsHash CID IPFS des métadonnées (titre, description, image...)
     * @return campaignId L'identifiant unique de la campagne créée
     */
    function createCampaign(
        uint256 goal,
        uint256 duration,
        address beneficiary,
        string calldata ipfsHash
    ) external whenNotPaused returns (uint256 campaignId) {
        // CHECKS
        require(goal > 0, "Goal must be > 0");
        require(beneficiary != address(0), "Beneficiary is zero address");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "Invalid duration");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");

        // EFFECTS
        campaignCount += 1;
        campaignId = campaignCount;

        uint256 deadline = block.timestamp + duration; //  block.timestamp est une variable globale qui donne le timestamp du bloc actuel (en secondes).

        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            beneficiary: beneficiary,
            goal: goal,
            deadline: deadline,
            totalRaised: 0,
            availableFunds: 0,
            ipfsHash: ipfsHash,
            status: CampaignStatus.Active,
            fundsWithdrawn: false,
            isFrozen: false
        });

        // INTERACTIONS
        emit CampaignCreated(
            campaignId,
            msg.sender,
            beneficiary,
            goal,
            deadline,
            ipfsHash
        );
    }
    /**
     * @notice Contribue à une campagne en envoyant de l'ETH.
     * @param campaignId Identifiant de la campagne
     * @dev   Le contributeur reçoit des CFD proportionnellement au montant envoyé.
     */
    function contribute(uint256 campaignId) external payable whenNotPaused nonReentrant {
            // payabla : Il autorise la fonction à recevoir de l'ETH.
        Campaign storage campaign = campaigns[campaignId];
            // storage : mot-clé qui indique que la variable est stockée dans l'état du contrat (storage) et non pas en mémoire temporaire (memory). Cela permet de modifier directement les données persistantes du contrat.
        // Checks-Effects-Interactions: C'est un pattern de sécurité (une bonne pratique) pour éviter les attaques par réentrance
        //  CHECKS 
        require(campaign.creator != address(0), "Campaign does not exist");
        require(campaign.status == CampaignStatus.Active, "Campaign not active");
        require(!campaign.isFrozen, "Campaign is frozen");
        require(block.timestamp < campaign.deadline, "Campaign ended");
        require(msg.value > 0, "Contribution must be > 0");

        //  EFFECTS 
        contributions[campaignId][msg.sender] += msg.value;
        campaign.totalRaised += msg.value;
        campaign.availableFunds += msg.value;

        // Calcul du nombre de CFD à minter
        // 1 ETH = 1000 CFD  →  msg.value * CFD_RATE / 1 ether
        uint256 cfdAmount = (msg.value * CFD_RATE) / 1 ether;

        //  INTERACTIONS 
        // TODO: Dès que le token par campagne sera en place :
        // ICFDToken(campaign.token).mint(msg.sender, cfdAmount);
        // INTERACTIONS
        if (cfdAmount > 0) {
            cfdToken.mint(msg.sender, cfdAmount);
        }

        emit Contributed(campaignId, msg.sender, msg.value, cfdAmount);
    }
    /**
     * @notice Finalise une campagne après sa deadline.
     *         Passe le statut à Successful ou Failed selon le total collecté.
     * @param campaignId Identifiant de la campagne
     */
    function finalizeCampaign(uint256 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];

        require(campaign.creator != address(0), "Campaign does not exist");
        require(campaign.status == CampaignStatus.Active, "Campaign not active");
        require(block.timestamp >= campaign.deadline, "Campaign still running");
        require(!campaign.isFrozen, "Campaign is frozen");

        if (campaign.totalRaised >= campaign.goal) {
            campaign.status = CampaignStatus.Successful;
        } else {
            campaign.status = CampaignStatus.Failed;
        }

        emit CampaignFinalized(campaignId, campaign.status);
    }
    /**
     * @notice Permet à un contributeur de se faire rembourser si la campagne a échoué ou a été annulée.
     * @param campaignId Identifiant de la campagne
     */
    function refund(uint256 campaignId) external nonReentrant whenNotPaused {
        Campaign storage campaign = campaigns[campaignId];

        // CHECKS
        require(campaign.creator != address(0), "Campaign does not exist");
        require(
            campaign.status == CampaignStatus.Failed || campaign.status == CampaignStatus.Cancelled,
            "Campaign not refundable"
        );
        require(!campaign.isFrozen, "Campaign is frozen");

        uint256 amount = contributions[campaignId][msg.sender];
        require(amount > 0, "Nothing to refund");

        // EFFECTS (important : on met à zéro AVANT d'envoyer l'ETH)
        contributions[campaignId][msg.sender] = 0;
        campaign.availableFunds -= amount;

        // TODO: Brûler les CFD du contributeur quand le token par campagne sera en place
        // ICFDToken(campaign.token).burn(msg.sender, cfdAmount);

        // INTERACTIONS
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Refund transfer failed");

        emit Refunded(campaignId, msg.sender, amount);
    }
    /**
     * @notice Gel ou dégel d'une campagne (uniquement appelable par le contrat de Gouvernance).
     * @param campaignId Identifiant de la campagne
     * @param frozen true = geler, false = dégeler
     */
    function setFrozen(uint256 campaignId, bool frozen) external {
        require(msg.sender == governance, "Only governance");
        require(campaigns[campaignId].creator != address(0), "Campaign does not exist");

        campaigns[campaignId].isFrozen = frozen;

        emit CampaignFrozen(campaignId, frozen);
    }
}


// NatSpec = Natural Specification (Spécification Naturelle). C'est un format de documentation standard pour Solidity.
// C'est un ensemble de commentaires spéciaux qui commencent par /// ou /** ... */ et qui utilisent des tags comme @title, @notice, @dev, @param, @return.
// À quoi ça sert ?
// Générer de la documentation automatiquement (avec des outils comme solc --userdoc ou hardhat docgen).
// Aider les IDE (VS Code) à afficher les infos au survol.