// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
// Strings.toString : convertit un nombre en texte (ex: 1 -> "1"), pour nommer le token de chaque campagne.
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
// On importe le contrat CFDToken car Crowdfunding va en DÉPLOYER un nouveau pour chaque campagne.
import {CFDToken} from "./CFDToken.sol";

/**
 * @title Interface minimale vers le contrat CFDToken
 * @dev   On ne dépend que de la fonction mint. lauutre contrat gère le reste (ERC20Votes, snapshots...).
 * @dev   (mise à jour) On dépend maintenant de 3 fonctions : mint (créer les CFD à la contribution),
 *        burn (détruire les CFD au remboursement) et balanceOf (lire combien de CFD possède un porteur).
 */
interface ICFDToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
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

    /// @notice Seuil au-delà duquel le multisig 2-sur-3 est obligatoire (valeur temporaire, à fixer avec l'équipe)
    /// @dev    Comparé au montant BRUT du retrait (avant frais) : "au-delà" = strictement supérieur.
    uint256 public constant MULTISIG_THRESHOLD = 0.5 ether; // 1 ether = 10^18 wei

    /// @notice Frais de plateforme, prélevés sur le montant BRUT d'un retrait (donc seulement si la campagne a réussi).
    /// @dev    Exprimés en POINTS DE BASE (BPS) : 1 point de base = 0,01 %, donc 100 BPS = 1 %.
    ///         Valeur actuelle : 300 BPS = 3 %. Pour changer le taux, on modifie UNIQUEMENT cette ligne
    ///         (ex: 250 = 2,5 %). Tout le reste du contrat utilise seulement le NOM PLATFORM_FEE_BPS.
    ///         C'est une constante : ni l'admin ni personne ne peut la modifier après le déploiement,
    ///         le bénéficiaire connaît donc à l'avance et définitivement ce qu'il paiera.
    uint256 public constant PLATFORM_FEE_BPS = 300;

    /// @notice Dénominateur des points de base : 10 000 BPS = 100 %. (À ne pas modifier.)
    uint256 public constant BPS_DENOMINATOR = 10_000;

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
        uint256 totalRefunded;    // Total déjà remboursé aux porteurs de CFD (historique)
        uint256 totalWithdrawn;   // Total déjà versé au bénéficiaire (historique)
        string  ipfsHash;         // CID IPFS des métadonnées
        ICFDToken token;          // Contrat CFD PROPRE à cette campagne (un token par campagne)
                                  // Typé avec l'interface (plus sûr que address)
        CampaignStatus status;
        bool    fundsWithdrawn;   // true si le bénéficiaire a déjà retiré
        bool    isFrozen;         // true si gelée par gouvernance
    }

    // Demande de retrait d'une campagne (une seule par campagne : le bénéficiaire retire tout en une fois).
    // Les montants sont FIGÉS au moment de la demande : le bénéficiaire, les votants et les signataires
    // voient exactement les mêmes chiffres (brut, frais, net) avant d'approuver.
    struct WithdrawalRequest {
        uint256 grossAmount;       // Montant BRUT qui sort de la campagne
        uint256 feeAmount;         // Part de la plateforme (frais)
        uint256 netAmount;         // Part nette du bénéficiaire (brut - frais)
        bool    requested;         // true une fois la demande faite
        bool    governanceApproved; // true quand les détenteurs de CFD ont voté pour (appel du contrat Governance)
        bool    multisigApproved;   // true quand 2 signataires sur 3 ont approuvé (appel du contrat MultiSig)
    }

    // VARIABLES D'ÉTAT

    /// @notice Compteur d'identifiants de campagne (commence à 1)
    uint256 public campaignCount; // Chaque nouvelle campagne aura un ID unique. On l'incrémente à chaque création.

    /// @notice campaignId => Campaign
    mapping(uint256 => Campaign) public campaigns;
    // mapping : équivalent d'un dict en Python (structure clé-valeur)

    /// @notice campaignId => contributeur => montant contribué (pour le refund)
    /// @dev    (mise à jour) Ce mapping est maintenant seulement un HISTORIQUE (affichage, statistiques).
    ///         Le remboursement ne dépend plus de lui mais du solde CFD du porteur.
    mapping(uint256 => mapping(address => uint256)) public contributions;

    /// @notice campaignId => demande de retrait
    mapping(uint256 => WithdrawalRequest) public withdrawals;

    /// @notice Frais de plateforme déjà prélevés mais pas encore envoyés au multisig
    /// @dev    On les met de côté au lieu de les envoyer dans la transaction de retrait : si le multisig ne pouvait
    ///         pas recevoir d'ETH, il bloquerait tous les retraits des bénéficiaires.
    uint256 public accruedFees;

    // Adresses des contrats externes
    // (cfdToken supprimé : il n'y a plus UN token pour tout, mais un token par campagne -> campaigns[id].token)
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
    event WithdrawalRequested(
        uint256 indexed campaignId,
        address indexed beneficiary,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount
    );
    event WithdrawalAuthorized(uint256 indexed campaignId, uint256 grossAmount);      // par la gouvernance
    event WithdrawalMultiSigApproved(uint256 indexed campaignId, uint256 grossAmount); // par le multisig
    event FundsWithdrawn(
        uint256 indexed campaignId,
        address indexed beneficiary,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount
    );
    event FeesTransferred(address indexed multiSig, uint256 amount);

    // CONSTRUCTEUR

    /**
     * @param admin     Adresse qui reçoit DEFAULT_ADMIN_ROLE et ADMIN_ROLE
     * @dev   (mise à jour) Plus de paramètre _cfdToken : chaque campagne déploie son propre token.
     */
    constructor(address admin) {
        // constructor : fonction spéciale qui s'exécute une seule fois, au moment du déploiement.
        require(admin != address(0), "Admin zero address");
        // Garde-fou : si quelqu'un modifie PLATFORM_FEE_BPS par erreur (ex: 30000 au lieu de 300), le déploiement échoue.
        require(PLATFORM_FEE_BPS <= BPS_DENOMINATOR, "Fee above 100%");
        //L'adresse zéro : 0x0000000000000000000000000000000000000000. 
        //  C'est une adresse spéciale qui ne peut pas recevoir de fonds 
        // (ou plutôt, les fonds envoyés à cette adresse sont perdus à jamais).

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
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

        // Déploiement du token CFD de CETTE campagne.
        // new CFDToken(...) : crée un NOUVEAU contrat sur la blockchain, avec sa propre adresse.
        // Ce n'est pas un appel vers un contrat inconnu : c'est notre propre code, donc pas de risque de réentrance ici.
        // - nom / symbole : "CFD Campagne 1" / "CFD-1", pour les distinguer dans MetaMask
        // - admin_ = address(this) : le contrat Crowdfunding est l'admin du token. Comme Crowdfunding n'a aucune
        //   fonction pour donner des rôles à quelqu'un d'autre, PERSONNE (pas même l'admin de la plateforme)
        //   ne pourra créer des CFD en dehors de contribute() -> impossible de fabriquer des voix de vote.
        // - minter_ = address(this) : Crowdfunding peut mint (contribute) et burn (refund).
        CFDToken newToken = new CFDToken(
            string.concat("CFD Campagne ", Strings.toString(campaignId)),
            string.concat("CFD-", Strings.toString(campaignId)),
            campaignId,
            address(this),
            address(this)
        );

        uint256 deadline = block.timestamp + duration; //  block.timestamp est une variable globale qui donne le timestamp du bloc actuel (en secondes).

        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            beneficiary: beneficiary,
            goal: goal,
            deadline: deadline,
            totalRaised: 0,
            availableFunds: 0,
            totalRefunded: 0,
            totalWithdrawn: 0,
            ipfsHash: ipfsHash,
            token: ICFDToken(address(newToken)),
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
        // 1 ETH = CFD_RATE CFD  →  msg.value * CFD_RATE
        // (mise à jour) PAS de division par 1 ether : l'ETH (wei) et le CFD ont tous les deux 18 décimales.
        // Donc 1 wei -> CFD_RATE plus-petites-unités de CFD. Avec la division, une petite contribution
        // donnait 0 CFD (donc aucun droit au remboursement) et 1 ETH ne donnait pas le bon nombre de CFD.
        uint256 cfdAmount = msg.value * CFD_RATE;

        //  INTERACTIONS 
        // On mint dans le token de CETTE campagne (et pas dans un token commun) :
        // les CFD de la campagne 1 ne donnent aucune voix dans la campagne 2.
        // (msg.value > 0 vérifié plus haut, donc cfdAmount > 0 : le test "if (cfdAmount > 0)" n'est plus utile)
        campaign.token.mint(msg.sender, cfdAmount);

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
        // (mise à jour) On n'exige plus "pas gelée" : le temps continue de s'écouler pendant un gel
        // (Conception.md §6). Une campagne gelée dont l'échéance est passée doit pouvoir être finalisée,
        // sinon ses contributeurs ne pourraient jamais être remboursés.

        _finalizeIfEnded(campaignId, campaign);
    }
    /**
     * @notice Permet à un contributeur de se faire rembourser si la campagne a échoué ou a été annulée.
     * @param campaignId Identifiant de la campagne
     */
    function refund(uint256 campaignId) external nonReentrant whenNotPaused {
        Campaign storage campaign = campaigns[campaignId];

        // CHECKS
        require(campaign.creator != address(0), "Campaign does not exist");

        // (mise à jour) Finalisation "paresseuse" : si l'échéance est passée mais que personne n'a encore appelé
        // finalizeCampaign, on met le statut à jour ici. Le temps ne lance pas de transaction tout seul
        // (Conception.md §5) : sans cette ligne, un remboursement serait refusé à tort.
        _finalizeIfEnded(campaignId, campaign);

        require(
            campaign.status == CampaignStatus.Failed || campaign.status == CampaignStatus.Cancelled,
            "Campaign not refundable"
        );
        // (mise à jour) Plus de "pas gelée" ici : rendre l'argent aux porteurs ne met personne en danger,
        // et Conception.md §6 dit qu'une campagne gelée qui échoue reste remboursable (hors pause).

        // (mise à jour) Le remboursement suit les CFD : c'est le PORTEUR actuel des CFD qui est remboursé,
        // pas forcément la personne qui a contribué à l'origine (il a peut-être reçu/acheté les CFD d'un autre).
        // CFD_RATE CFD = 1 ETH  →  ETH à rembourser = solde CFD / CFD_RATE
        ICFDToken token = campaign.token;
        uint256 cfdBalance = token.balanceOf(msg.sender);
        uint256 amount = cfdBalance / CFD_RATE;
        require(amount > 0, "Nothing to refund");

        // EFFECTS (important : on détruit les CFD AVANT d'envoyer l'ETH -> deuxième remboursement impossible)
        campaign.availableFunds -= amount;
        campaign.totalRefunded += amount;

        // CORRECTION : on ne brûle que les CFD effectivement remboursés (amount * CFD_RATE).
        // Les fractions non remboursables (< 1 wei) restent dans le portefeuille du contributeur.
        // Elles ne valent plus rien (campagne échouée), mais elles ne sont pas détruites injustement. uint256 cfdToBurn = amount * CFD_RATE;
        uint256 cfdToBurn = amount * CFD_RATE;
        token.burn(msg.sender, cfdToBurn);  

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
    /**
     * @notice Annule une campagne (uniquement appelable par le contrat de Gouvernance).
     *         Les contributeurs pourront alors se faire rembourser.
     * @param campaignId Identifiant de la campagne
     * @dev    Une campagne annulée passe au statut Cancelled. Les CFD restent en circulation
     *         jusqu'au remboursement, où ils seront brûlés.
     *         Le gel n'empêche pas l'annulation (c'est une décision de gouvernance).
     */
    function cancelCampaign(uint256 campaignId) external {
        require(msg.sender == governance, "Only governance");

        Campaign storage campaign = campaigns[campaignId];
        require(campaign.creator != address(0), "Campaign does not exist");
        require(campaign.status == CampaignStatus.Active, "Campaign not active");

        // Finalisation paresseuse : si la deadline est passée, on met à jour le statut avant d'annuler.
        // (Si la campagne est déjà Successful ou Failed, on ne peut pas l'annuler.)
        _finalizeIfEnded(campaignId, campaign);

        // Après finalisation, on ne peut annuler qu'une campagne qui est encore Active.
        // (Si elle est devenue Successful ou Failed, on refuse.)
        require(campaign.status == CampaignStatus.Active, "Campaign already finalized");

        campaign.status = CampaignStatus.Cancelled;

        emit CampaignFinalized(campaignId, CampaignStatus.Cancelled);
    }
        
    //                    FONCTIONS D'ADMINISTRATION
   

    /**
     * @notice Définit l'adresse du contrat de gouvernance.
     * @dev    Uniquement appelable par l'admin.
     * @dev    (mise à jour) Appelable UNE SEULE FOIS. Sinon l'admin pourrait remplacer la gouvernance par sa propre
     *         adresse, puis geler ou dégeler les campagnes seul via setFrozen : la décision ne reviendrait plus
     *         aux détenteurs de CFD. Il faut donc être sûr de l'adresse avant d'appeler (script de déploiement).
     */
    function setGovernance(address _governance) external onlyRole(ADMIN_ROLE) {
        require(_governance != address(0), "Zero address");
        require(governance == address(0), "Governance already set");
        governance = _governance;
    }

    /**
     * @notice Définit l'adresse du contrat multisig.
     * @dev    Uniquement appelable par l'admin.
     * @dev    (mise à jour) Appelable UNE SEULE FOIS, pour la même raison que setGovernance :
     *         l'admin ne doit pas pouvoir remplacer les signataires après coup.
     */
    function setMultiSig(address _multiSig) external onlyRole(ADMIN_ROLE) {
        require(_multiSig != address(0), "Zero address");
        require(multiSig == address(0), "MultiSig already set");
        multiSig = _multiSig;
    }

    /**
     * @notice Pause d'urgence de toute la plateforme (circuit breaker).
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Reprend les opérations après une pause.
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

   
    //                    FONCTIONS DE RETRAIT (gouvernance + multisig + frais)

    // Déroulement complet d'un retrait :
    //   1. requestWithdrawal   (bénéficiaire)  : fige brut / frais / net et ferme la collecte si c'est anticipé
    //   2. authorizeWithdrawal (contrat Governance) : après le vote des détenteurs de CFD de la campagne
    //   3. approveWithdrawalMultiSig (contrat MultiSig) : 2 signataires sur 3, SEULEMENT si brut > MULTISIG_THRESHOLD
    //   4. withdrawFunds       (bénéficiaire)  : paie le net au bénéficiaire, met les frais de côté
    //   5. withdrawFees        (tout le monde) : envoie les frais accumulés au multisig
    // Les étapes 2 et 3 sont deux mécanismes DIFFÉRENTS (vote communautaire / signataires) et indépendants :
    // elles peuvent arriver dans n'importe quel ordre, mais withdrawFunds exige les deux (si le seuil est dépassé).

    /**
     * @notice Le bénéficiaire demande à retirer les fonds de la campagne.
     * @dev    Deux cas :
     *         - campagne déjà Successful (échéance passée, objectif atteint) ;
     *         - retrait ANTICIPÉ : campagne encore Active mais objectif déjà atteint. La demande ferme alors
     *           définitivement la collecte (statut Successful) pour que le montant ne change plus pendant le vote.
     *         Refusé si l'objectif n'est pas atteint : on ne paie jamais des fonds encore nécessaires à un remboursement.
     *         Cette fonction n'envoie aucun ETH.
     */
    function requestWithdrawal(uint256 campaignId) external whenNotPaused {
        Campaign storage campaign = campaigns[campaignId];

        // CHECKS
        require(campaign.creator != address(0), "Campaign does not exist");
        require(msg.sender == campaign.beneficiary, "Only beneficiary");
        require(!campaign.isFrozen, "Campaign is frozen");

        // Si l'échéance est passée, on met le statut à jour (finalisation paresseuse).
        _finalizeIfEnded(campaignId, campaign);

        // Retrait anticipé : encore Active (donc avant l'échéance) mais objectif atteint -> on ferme la collecte.
        if (campaign.status == CampaignStatus.Active) {
            require(campaign.totalRaised >= campaign.goal, "Goal not reached");
            campaign.status = CampaignStatus.Successful;
            emit CampaignFinalized(campaignId, campaign.status);
        }

        require(campaign.status == CampaignStatus.Successful, "Campaign not successful");
        require(!withdrawals[campaignId].requested, "Withdrawal already requested");
        require(campaign.availableFunds > 0, "No funds available");

        // EFFECTS : on fige les montants. Après le statut Successful, availableFunds ne peut plus changer.
        uint256 grossAmount = campaign.availableFunds;
        (uint256 feeAmount, uint256 netAmount) = _computeFee(grossAmount);

        withdrawals[campaignId] = WithdrawalRequest({
            grossAmount: grossAmount,
            feeAmount: feeAmount,
            netAmount: netAmount,
            requested: true,
            governanceApproved: false,
            multisigApproved: false
        });

        emit WithdrawalRequested(campaignId, campaign.beneficiary, grossAmount, feeAmount, netAmount);
    }

    /**
     * @notice Enregistre l'autorisation de la gouvernance (vote des détenteurs de CFD adopté et exécuté).
     * @dev    Uniquement appelable par le contrat de Gouvernance (même principe que setFrozen).
     */
    function authorizeWithdrawal(uint256 campaignId) external {
        require(msg.sender == governance, "Only governance");

        WithdrawalRequest storage request = withdrawals[campaignId];
        require(request.requested, "No withdrawal requested");
        require(!request.governanceApproved, "Already authorized");
        require(campaigns[campaignId].status == CampaignStatus.Successful, "Campaign not successful");

        request.governanceApproved = true;

        emit WithdrawalAuthorized(campaignId, request.grossAmount);
    }

    /**
     * @notice Enregistre l'approbation 2-sur-3 des signataires.
     * @dev    Uniquement appelable par le contrat MultiSig, une fois que 2 signataires sur 3 ont approuvé.
     *         Demandée seulement si le montant BRUT dépasse MULTISIG_THRESHOLD.
     */
    function approveWithdrawalMultiSig(uint256 campaignId) external {
        require(msg.sender == multiSig, "Only multisig");

        WithdrawalRequest storage request = withdrawals[campaignId];
        require(request.requested, "No withdrawal requested");
        require(!request.multisigApproved, "Already approved");
        require(request.grossAmount > MULTISIG_THRESHOLD, "MultiSig not required");
        require(campaigns[campaignId].status == CampaignStatus.Successful, "Campaign not successful");

        request.multisigApproved = true;

        emit WithdrawalMultiSigApproved(campaignId, request.grossAmount);
    }

    /**
     * @notice Le bénéficiaire reçoit le montant NET ; les frais de plateforme sont mis de côté.
     * @dev    Revérifie TOUT au moment du paiement (état, gel, pause, autorisations) : un gel ou une annulation
     *         après le vote bloque quand même le paiement.
     *         Les frais ne sont prélevés qu'ici : une campagne échouée ou annulée n'en paie jamais
     *         (le remboursement rend l'intégralité des ETH).
     */
    function withdrawFunds(uint256 campaignId) external nonReentrant whenNotPaused {
        Campaign storage campaign = campaigns[campaignId];
        WithdrawalRequest storage request = withdrawals[campaignId];

        // CHECKS
        require(campaign.creator != address(0), "Campaign does not exist");
        require(msg.sender == campaign.beneficiary, "Only beneficiary");
        require(campaign.status == CampaignStatus.Successful, "Campaign not successful");
        require(!campaign.fundsWithdrawn, "Funds already withdrawn");
        require(!campaign.isFrozen, "Campaign is frozen");
        require(request.requested, "No withdrawal requested");
        require(request.governanceApproved, "Governance approval required");
        if (request.grossAmount > MULTISIG_THRESHOLD) {
            require(request.multisigApproved, "MultiSig approval required");
        }

        uint256 grossAmount = request.grossAmount;
        uint256 feeAmount = request.feeAmount;
        uint256 netAmount = request.netAmount;

        // EFFECTS
        campaign.availableFunds -= grossAmount;
        campaign.totalWithdrawn += grossAmount;
        campaign.fundsWithdrawn = true;
        accruedFees += feeAmount;

        // INTERACTIONS
        (bool success, ) = payable(campaign.beneficiary).call{value: netAmount}("");
        require(success, "Withdraw failed");

        emit FundsWithdrawn(campaignId, campaign.beneficiary, grossAmount, feeAmount, netAmount);
    }

    /**
     * @notice Envoie les frais accumulés au contrat MultiSig (la trésorerie de la plateforme).
     * @dev    Appelable par tout le monde : l'argent va TOUJOURS au multisig, personne ne peut le détourner.
     *         Ensuite, toute sortie d'argent depuis le multisig exige 2 signataires sur 3.
     *         Le contrat MultiSig doit pouvoir recevoir de l'ETH.
     */
    function withdrawFees() external nonReentrant whenNotPaused {
        require(multiSig != address(0), "MultiSig not set");

        uint256 amount = accruedFees;
        require(amount > 0, "No fees to transfer");

        // EFFECTS
        accruedFees = 0;

        // INTERACTIONS
        (bool success, ) = payable(multiSig).call{value: amount}("");
        require(success, "Fee transfer failed");

        emit FeesTransferred(multiSig, amount);
    }

    /**
     * @notice TRANSPARENCE : ce que le bénéficiaire recevra, avant et après la demande de retrait.
     * @dev    Avant la demande : calcul sur les fonds disponibles. Après : montants figés de la demande.
     *         Le frontend affiche ces chiffres au bénéficiaire et aux votants.
     * @return grossAmount   Montant brut qui sort de la campagne
     * @return feeAmount     Frais de plateforme
     * @return netAmount     Montant net reçu par le bénéficiaire
     * @return needsMultiSig true si l'approbation 2-sur-3 sera exigée (brut > MULTISIG_THRESHOLD)
     */
    function previewWithdrawal(uint256 campaignId)
        external
        view
        returns (uint256 grossAmount, uint256 feeAmount, uint256 netAmount, bool needsMultiSig)
    {
        require(campaigns[campaignId].creator != address(0), "Campaign does not exist");

        WithdrawalRequest storage request = withdrawals[campaignId];
        if (request.requested) {
            grossAmount = request.grossAmount;
            feeAmount = request.feeAmount;
            netAmount = request.netAmount;
        } else {
            grossAmount = campaigns[campaignId].availableFunds;
            (feeAmount, netAmount) = _computeFee(grossAmount);
        }
        needsMultiSig = grossAmount > MULTISIG_THRESHOLD;
    }

    //                    FONCTIONS INTERNES

    /**
     * @dev Sépare un montant brut en frais de plateforme (PLATFORM_FEE_BPS) et montant net.
     */
    function _computeFee(uint256 grossAmount) internal pure returns (uint256 feeAmount, uint256 netAmount) {
        // Arrondi vers le bas pour les frais : feeAmount + netAmount == grossAmount, aucun wei perdu.
        feeAmount = (grossAmount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        netAmount = grossAmount - feeAmount;
    }

    /**
     * @dev Si la campagne est encore "Active" mais que son échéance est passée, fixe son statut final :
     *      Successful si l'objectif est atteint, Failed sinon. Sinon ne fait rien.
     *      internal : appelable seulement depuis ce contrat (finalizeCampaign et refund).
     */
    function _finalizeIfEnded(uint256 campaignId, Campaign storage campaign) internal {
        if (campaign.status == CampaignStatus.Active && block.timestamp >= campaign.deadline) {
            if (campaign.totalRaised >= campaign.goal) {
                campaign.status = CampaignStatus.Successful;
            } else {
                campaign.status = CampaignStatus.Failed;
            }

            emit CampaignFinalized(campaignId, campaign.status);
        }
    }
}


// NatSpec = Natural Specification (Spécification Naturelle). C'est un format de documentation standard pour Solidity.
// C'est un ensemble de commentaires spéciaux qui commencent par /// ou /** ... */ et qui utilisent des tags comme @title, @notice, @dev, @param, @return.
// À quoi ça sert ?
// Générer de la documentation automatiquement (avec des outils comme solc --userdoc ou hardhat docgen).
// Aider les IDE (VS Code) à afficher les infos au survol.