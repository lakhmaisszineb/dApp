// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title EnvCheck — contrat pour le test de la Phase 1 (J1)
 * @notice Sert uniquement à prouver que la chaîne d'outils fonctionne :
 *         OpenZeppelin v5 (ERC20Votes, AccessControl, Pausable, ReentrancyGuard)
 *         compile avec Solidity 0.8.28 et que le snapshot de vote est utilisable.
 */
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EnvCheck is ERC20, ERC20Permit, ERC20Votes, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    constructor(address admin) ERC20("EnvCheck", "ENV") ERC20Permit("EnvCheck") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused nonReentrant {
        _mint(to, amount);
        // Sans délégation, un solde ne donne AUCUN pouvoir de vote avec ERC20Votes.
        // On auto-délègue à la première réception (à reprendre dans CFDToken en J2).
        if (delegates(to) == address(0)) _delegate(to, to);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // --- Résolution d'héritage multiple obligatoire (OZ v5) ---
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
