// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ERC-20 : soldes, transferts, approbations et offre totale.
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Fournit notamment l'infrastructure de signatures utilisée
// avec ERC20Votes.
import {ERC20Permit} from
    "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

// Conserve l'historique du pouvoir de vote.
import {ERC20Votes} from
    "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

// Permet de définir les comptes autorisés à créer les jetons.
import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";

// Nécessaire pour résoudre l'héritage commun
// entre ERC20Permit et ERC20Votes.
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title CFDToken
 *
 * @notice Une instance de ce contrat correspond à UNE campagne.
 *
 * Exemple :
 * - la campagne 1 utilise une première instance ;
 * - la campagne 2 utilise une autre instance.
 *
 * Les soldes, les transferts et les historiques de vote
 * sont indépendants entre ces instances.
 *
 * Règles :
 * - aucun jeton n'est créé au déploiement ;
 * - seul MINTER_ROLE peut créer des jetons ;
 * - chaque destinataire dispose automatiquement de ses voix ;
 * - la délégation des voix à une autre adresse est interdite ;
 * - les transferts modifient les droits futurs, sans modifier
 *   les droits enregistrés dans un ancien snapshot.
 *
 * Ce contrat ne crée pas les propositions et ne comptabilise
 * pas les bulletins de vote : cela relève de la gouvernance.
 */
contract CFDToken is ERC20, ERC20Permit, ERC20Votes, AccessControl {
    /// @notice Rôle autorisant l'appel de mint().
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Campagne à laquelle cette instance appartient.
    /// @dev immutable : définie au déploiement, non modifiable ensuite.
    uint256 public immutable campaignId;

    /// @notice Adresse nulle interdite pour les comptes privilégiés.
    error InvalidAddress();

    /// @notice Une création de zéro jeton est interdite.
    error ZeroMintAmount();

    /// @notice Les voix doivent rester attachées au détenteur.
    error ExternalDelegationDisabled();

    /**
     * @param name_ Nom affiché pour ce token.
     * @param symbol_ Symbole affiché pour ce token.
     * @param campaignId_ Identifiant de la campagne associée.
     * @param admin_ Adresse administrant les rôles du token.
     * @param minter_ Adresse autorisée initialement à créer les jetons.
     *
     * En intégration :
     * minter_ doit être l'adresse du contrat Crowdfunding.
     *
     * Dans les tests :
     * un compte de test représentera ce contrat.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 campaignId_,
        address admin_,
        address minter_
    )
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (admin_ == address(0) || minter_ == address(0)) {
            revert InvalidAddress();
        }

        campaignId = campaignId_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MINTER_ROLE, minter_);

        // Aucun _mint ici :
        // les jetons seront créés lors des contributions.
    }

    /**
     * @notice Crée des jetons pour un contributeur.
     *
     * @param to Adresse du destinataire.
     * @param amount Quantité exprimée dans la plus petite unité CFD.
     *
     * Exemple :
     * 100 CFD = 100 * 10**18 unités.
     *
     * Le calcul ETH -> CFD est effectué par Crowdfunding.
     * Cette fonction ne reçoit pas les ETH.
     */
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        if (amount == 0) {
            revert ZeroMintAmount();
        }

        // OpenZeppelin refuse automatiquement un destinataire nul.
        // _mint appelle également notre fonction _update.
        _mint(to, amount);
    }

    /**
     * @dev Point de passage des créations, transferts et destructions.
     *
     * super._update :
     * - met à jour les soldes ERC-20 ;
     * - met à jour l'historique ERC20Votes.
     *
     * Après réception, si le compte n'a pas encore activé ses voix,
     * nous les activons automatiquement sur sa propre adresse.
     */
    function _update(
        address from,
        address to,
        uint256 value
    )
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);

        // Un transfert de zéro ne doit pas activer de délégation.
        // L'adresse nulle représente une destruction de jetons.
        if (
            to != address(0) &&
            value > 0 &&
            delegates(to) == address(0)
        ) {
            _delegate(to, to);
        }
    }

    /**
     * @dev Impose que chaque détenteur utilise ses propres voix.
     *
     * Le contrôle se trouve dans la fonction interne commune :
     * il s'applique aussi aux délégations demandées par signature.
     */
    function _delegate(address account, address delegatee)
        internal
        override
    {
        if (delegatee != account) {
            revert ExternalDelegationDisabled();
        }

        super._delegate(account, delegatee);
    }

    /**
     * @dev Résout l'héritage commun des compteurs de signatures.
     */
    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}