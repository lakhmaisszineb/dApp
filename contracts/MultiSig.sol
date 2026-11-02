// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ReentrancyGuard : protection contre la réentrance (bonne pratique OpenZeppelin / CEI).
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MultiSig
 * @notice Gère une trésorerie à 3 signataires (2-sur-3).
 *         Les frais de plateforme sont envoyés ici.
 *         Pour sortir de l'argent ou appeler une fonction, il faut 2 signatures sur 3.
 * @dev    Suit les règles définies dans Conception.md.
 */
contract MultiSig is ReentrancyGuard {

    // STRUCTURES

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        bool exists;
        uint256 confirmations;
    }

    // VARIABLES D'ÉTAT

    address[3] public signataires;
    mapping(address => bool) public isSignataire;
    uint256 public transactionCount;
    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;

    // ÉVÉNEMENTS

    event TransactionSubmitted(uint256 indexed txId, address indexed to, uint256 value);
    event TransactionConfirmed(uint256 indexed txId, address indexed signataire);
    event TransactionExecuted(uint256 indexed txId);
    event Deposit(address indexed sender, uint256 amount);

    // MODIFICATEURS

    modifier onlySignataire() {
        require(isSignataire[msg.sender], "Not a signataire");
        _;
    }

    // CONSTRUCTEUR

    constructor(address[3] memory _signataires) {
        require(_signataires[0] != address(0), "Signataire 0 zero address");
        require(_signataires[1] != address(0), "Signataire 1 zero address");
        require(_signataires[2] != address(0), "Signataire 2 zero address");
        require(_signataires[0] != _signataires[1], "Duplicate signataire");
        require(_signataires[0] != _signataires[2], "Duplicate signataire");
        require(_signataires[1] != _signataires[2], "Duplicate signataire");

        signataires = _signataires;
        isSignataire[_signataires[0]] = true;
        isSignataire[_signataires[1]] = true;
        isSignataire[_signataires[2]] = true;
    }

    // FONCTIONS

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function submitTransaction(address to, uint256 value, bytes calldata data)
        external
        onlySignataire
        returns (uint256 txId)
    {
        require(to != address(0), "To zero address");

        transactionCount += 1;
        txId = transactionCount;

        transactions[txId] = Transaction({
            to: to,
            value: value,
            data: data,
            executed: false,
            exists: true,
            confirmations: 1
        });

        confirmations[txId][msg.sender] = true;

        emit TransactionSubmitted(txId, to, value);
        emit TransactionConfirmed(txId, msg.sender);
    }

    function confirmTransaction(uint256 txId) external onlySignataire {
        Transaction storage txn = transactions[txId];
        require(txn.exists, "Transaction does not exist");
        require(!txn.executed, "Transaction already executed");
        require(!confirmations[txId][msg.sender], "Already confirmed");

        confirmations[txId][msg.sender] = true;
        txn.confirmations += 1;

        emit TransactionConfirmed(txId, msg.sender);
    }

    function executeTransaction(uint256 txId) external onlySignataire nonReentrant {
        Transaction storage txn = transactions[txId];
        require(txn.exists, "Transaction does not exist");
        require(!txn.executed, "Transaction already executed");
        require(txn.confirmations >= 2, "Not enough confirmations");

        txn.executed = true;

        (bool success, ) = payable(txn.to).call{value: txn.value}(txn.data);
        require(success, "Transaction failed");

        emit TransactionExecuted(txId);
    }

    //                    FONCTIONS DE LECTURE (getters pratiques)

    /**
     * @notice Retourne les détails d'une transaction.
     * @param txId L'ID de la transaction.
     * @dev    (mise à jour) La variable de retour est nommée `confirmationCount`
     *         pour éviter de masquer le mapping `confirmations`.
     */
    function getTransaction(uint256 txId) external view returns (
        address to,
        uint256 value,
        bytes memory data,
        bool executed,
        uint256 confirmationCount
    ) {
        Transaction storage txn = transactions[txId];
        require(txn.exists, "Transaction does not exist");
        return (txn.to, txn.value, txn.data, txn.executed, txn.confirmations);
    }

    function isConfirmed(uint256 txId, address signataire) external view returns (bool) {
        return confirmations[txId][signataire];
    }
}