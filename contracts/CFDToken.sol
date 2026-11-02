// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ERC20Permit} from
    "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import {ERC20Votes} from
    "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";

import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title CFDToken
 * @notice Token ERC-20 associé à une seule campagne de crowdfunding.
 *
 * @dev Architecture :
 * - chaque campagne utilise une instance distincte de ce contrat ;
 * - aucun jeton n'est créé au déploiement ;
 * - les jetons utilisent 18 décimales, valeur ERC-20 par défaut ;
 * - MINTER_ROLE autorise la création ;
 * - BURNER_ROLE autorise la destruction sans allowance ;
 * - les voix sont automatiquement déléguées au détenteur ;
 * - la délégation à une autre adresse est interdite ;
 * - les changements actuels ne modifient pas les anciens snapshots.
 *
 * Responsabilités :
 * - Crowdfunding vérifie les contributions et les remboursements ;
 * - ce contrat gère les jetons, les permissions et les historiques ;
 * - la gouvernance gère les propositions et les bulletins de vote.
 *
 * ERC20Permit fournit les autorisations de dépense par signature.
 * Cette fonctionnalité n'est pas nécessaire au vote ou au transfert direct.
 */
contract CFDToken is ERC20, ERC20Permit, ERC20Votes, AccessControl {
    // =============================================================
    //                            RÔLES
    // =============================================================

    /// @notice Permission de créer des CFD avec mint().
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Permission de détruire des CFD avec burn().
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // =============================================================
    //                      IDENTITÉ DE CAMPAGNE
    // =============================================================

    /// @notice Identifiant de la campagne associée à cette instance.
    /// @dev Fixé au déploiement et non modifiable ensuite.
    uint256 public immutable campaignId;

    // =============================================================
    //                           ERREURS
    // =============================================================

    /// @notice Administrateur ou contrôleur initial égal à l'adresse nulle.
    error InvalidAddress();

    /// @notice Tentative de création de zéro jeton.
    error ZeroMintAmount();

    /// @notice Tentative de destruction de zéro jeton.
    error ZeroBurnAmount();

    /// @notice Tentative de délégation des voix à une autre adresse.
    error ExternalDelegationDisabled();

    // =============================================================
    //                         CONSTRUCTEUR
    // =============================================================

    /**
     * @param name_ Nom complet du token.
     * @param symbol_ Symbole du token.
     * @param campaignId_ Identifiant de la campagne.
     * @param admin_ Adresse administrant les rôles du token.
     * @param minter_ Contrôleur initial recevant MINTER_ROLE et BURNER_ROLE.
     *
     * @dev Dans la dernière version de Crowdfunding :
     * admin_ et minter_ valent tous les deux address(this).
     * Crowdfunding est donc administrateur, minter et burner du token.
     *
     * Le paramètre minter_ est conservé pour garder le constructeur
     * compatible avec le code d'intégration existant.
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
        _grantRole(BURNER_ROLE, minter_);

        // Pas de création initiale :
        // totalSupply() vaut zéro au déploiement.
    }

    // =============================================================
    //                     CRÉATION DES JETONS
    // =============================================================

    /**
     * @notice Crée des CFD pour un destinataire.
     * @param to Adresse recevant les jetons.
     * @param amount Quantité en petites unités CFD.
     *
     * @dev Seul MINTER_ROLE peut appeler cette fonction.
     * Crowdfunding vérifie la contribution et calcule la quantité.
     *
     * Avec 18 décimales :
     * 100 CFD = 100 * 10**18 petites unités.
     *
     * OpenZeppelin refuse un destinataire nul.
     */
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        if (amount == 0) {
            revert ZeroMintAmount();
        }

        _mint(to, amount);
    }

    // =============================================================
    //                    DESTRUCTION DES JETONS
    // =============================================================

    /**
     * @notice Détruit des CFD détenus par une adresse.
     * @param from Adresse dont les jetons sont détruits.
     * @param amount Quantité en petites unités CFD.
     *
     * @dev Seul BURNER_ROLE peut appeler cette fonction.
     * Aucune allowance du détenteur n'est nécessaire.
     *
     * IMPORTANT :
     * Le token ne vérifie pas l'état de la campagne.
     * Crowdfunding doit vérifier l'éligibilité au remboursement
     * et déterminer la quantité à détruire.
     *
     * OpenZeppelin refuse :
     * - une adresse source nulle ;
     * - une quantité supérieure au solde.
     *
     * La destruction réduit :
     * - le solde de from ;
     * - totalSupply ;
     * - son pouvoir de vote actuel.
     *
     * Les voix des anciens snapshots restent inchangées.
     */
    function burn(address from, uint256 amount)
        external
        onlyRole(BURNER_ROLE)
    {
        if (amount == 0) {
            revert ZeroBurnAmount();
        }

        _burn(from, amount);
    }

    // =============================================================
    //               SOLDES ET HISTORIQUES DE VOTE
    // =============================================================

    /**
     * @dev Point commun aux créations, transferts et destructions.
     *
     * super._update conserve les mécanismes hérités :
     * - mise à jour des soldes et de l'offre totale ;
     * - émission de Transfer ;
     * - mise à jour des historiques de vote.
     *
     * Après une réception positive, le destinataire est automatiquement
     * délégué à lui-même s'il n'a pas encore de délégation.
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

        if (
            to != address(0) &&
            value > 0 &&
            delegates(to) == address(0)
        ) {
            _delegate(to, to);
        }
    }

    /**
     * @dev Autorise uniquement la délégation à soi-même.
     *
     * Pour transmettre ses droits futurs à une autre adresse,
     * le détenteur doit transférer les jetons.
     *
     * Ce contrôle s'applique également aux délégations par signature,
     * car elles passent par cette fonction interne.
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

    // =============================================================
    //                       SIGNATURES
    // =============================================================

    /**
     * @notice Retourne le nonce actuel d'une adresse.
     * @param owner Adresse concernée.
     * @return Compteur actuel utilisé par les mécanismes de signature.
     *
     * @dev Résout l'héritage commun entre ERC20Permit et Nonces.
     * Cette lecture ne consomme pas de nonce.
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