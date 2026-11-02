// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MultiSig
 * @notice Gère une trésorerie à 3 signataires (2-sur-3).
 *         Les frais de plateforme sont envoyés ici.
 *         Pour sortir de l'argent ou appeler une fonction, il faut 2 signatures sur 3.
 * @dev    Suit les règles définies dans Conception.md.
 */
contract MultiSig {

    // STRUCTURES

    struct Transaction {
        address to;           // Adresse cible (Crowdfunding ou autre)
        uint256 value;        // Montant d'ETH à envoyer
        bytes data;           // Données de l'appel (pour appeler une fonction)
        bool executed;        // true si exécutée
        uint256 confirmations; // Nombre de confirmations
    }

    // VARIABLES D'ÉTAT

    /// @notice Les 3 signataires.
    address[3] public signataires;

    /// @notice Vérification rapide : est-ce un signataire ?
    mapping(address => bool) public isSignataire;

    /// @notice Compteur de transactions.
    uint256 public transactionCount;

    /// @notice transactionId => Transaction
    mapping(uint256 => Transaction) public transactions;

    /// @notice transactionId => signataire => a confirmé ?
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

    /**
     * @param _signataires Les 3 adresses des signataires.
     */
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

    /**
     * @notice Reçoit de l'ETH (les frais de plateforme).
     */
    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @notice Soumet une transaction.
     * @param to Adresse cible.
     * @param value Montant d'ETH à envoyer.
     * @param data Données de l'appel (pour appeler une fonction).
     * @return txId L'ID de la transaction.
     */
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
            confirmations: 0
        });

        emit TransactionSubmitted(txId, to, value);
    }

    /**
     * @notice Confirme une transaction.
     * @param txId L'ID de la transaction.
     */
    function confirmTransaction(uint256 txId) external onlySignataire {
        Transaction storage txn = transactions[txId];
        require(txn.to != address(0), "Transaction does not exist");
        require(!txn.executed, "Transaction already executed");
        require(!confirmations[txId][msg.sender], "Already confirmed");

        confirmations[txId][msg.sender] = true;
        txn.confirmations += 1;

        emit TransactionConfirmed(txId, msg.sender);
    }

    /**
     * @notice Exécute une transaction si 2/3 ont confirmé.
     * @param txId L'ID de la transaction.
     */
    function executeTransaction(uint256 txId) external onlySignataire {
        Transaction storage txn = transactions[txId];
        require(txn.to != address(0), "Transaction does not exist");
        require(!txn.executed, "Transaction already executed");
        require(txn.confirmations >= 2, "Not enough confirmations");

        txn.executed = true;

        (bool success, ) = payable(txn.to).call{value: txn.value}(txn.data);
        require(success, "Transaction failed");

        emit TransactionExecuted(txId);
    }
}