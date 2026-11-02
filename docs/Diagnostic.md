# Diagnostic technique des contrats actuels

L'objectif de valider individuellement et conjointement les deux premiers smart contracts développés (`CFDToken.sol` et `Crowdfunding.sol`), en vérifiant :
1. Le respect des règles de création et de paramétrage des campagnes définies lors de la conception.
2. La sécurité des contrôles d'accès (`AccessControl` d'OpenZeppelin) pour l'émission des jetons (`MINTER_ROLE`) et l'administration (`ADMIN_ROLE`).
3. Le mécanisme d'auto-délégation du pouvoir de vote (`ERC20Votes`) et l'interdiction de délégation externe.
4. La communication entre `Crowdfunding` et `CFDToken` lors des contributions.

## Test de compilation des contrats pour vérifier l'absence d'erreurs :
npx hardhat compile
Vérification : Hardhat doit afficher Compiled X Solidity files successfully
Resultat : Compiled 2 Solidity files with solc 0.8.28

## Test de communication entre les deux contrats
Pour tester et realiser une communication entre les deux contrats il faut ajouter dans contracts/Crowdfunding.sol, à la fin de la fonction contribute() l'appel :
if (cfdAmount > 0) {
            cfdToken.mint(msg.sender, cfdAmount);
        }

        emit Contributed(campaignId, msg.sender, msg.value, cfdAmount);
apres :
// TODO: Dès que le token par campagne sera en place :
// ICFDToken(campaign.token).mint(msg.sender, cfdAmount);

## Test unitaires des Contrats `CFDToken` et `Crowdfunding` & Vérification d'Intégration
Le fichier test/J2_Crowdfunding_CFDToken.test.js teste l'intégralité de CFDToken.sol et Crowdfunding.sol : paramètres de déploiement, création de campagnes, contrôles des bornes, rôles et accès autorisés (MINTER_ROLE, ADMIN_ROLE, governance), auto-délégation des votes et cycle de contribution/remboursement.

### Tests du contrat `CFDToken.sol`

| ID Test | Scénario testé | Résultat attendu | Statut |
| :--- | :--- | :--- | :--- |
| **1.1** | Déploiement nominal | `name`, `symbol`, `campaignId` initialisés ; `totalSupply == 0` ; rôles `DEFAULT_ADMIN_ROLE` et `MINTER_ROLE` attribués. | Validé |
| **1.2** | Déploiement avec adresse nulle (`admin` ou `minter`) | Transaction annulée avec l'erreur personnalisée `InvalidAddress()`. | Validé |
| **1.3** | Contrôle d'accès sur `mint(to, amount)` | Seul un compte possédant `MINTER_ROLE` peut frapper des CFD ; tout autre compte échoue avec `AccessControlUnauthorizedAccount`. | Validé |
| **1.4** | Protection des valeurs sur `mint()` | Montant nul refusé (`ZeroMintAmount()`) ; adresse destinataire nulle refusée (`ERC20InvalidReceiver`). | Validé |
| **1.5** | Auto-délégation automatique des voix (`_update`) | Dès le premier `mint`, `delegates(user) == user` et `getVotes(user) == balanceOf(user)` sans transaction supplémentaire. | Validé |
| **1.6** | Interdiction de délégation externe (`_delegate`) | Tout appel à `delegate(autreAdresse)` échoue avec `ExternalDelegationDisabled()`. | Validé |

### Tests du contrat `Crowdfunding.sol`

| ID Test | Scénario testé | Résultat attendu | Statut |
| :--- | :--- | :--- | :--- |
| **2.1** | Déploiement nominal et constantes | `CFD_RATE = 1000`, `MULTISIG_THRESHOLD = 0.5 ETH`, `MIN_DURATION = 1 days`, `MAX_DURATION = 90 days`, `ADMIN_ROLE` attribué. | Validé |
| **2.2** | Déploiement avec adresse nulle | Refusé avec `"Admin zero address"` ou `"CFDToken zero address"`. | Validé |
| **2.3** | Création de campagne valide (`createCampaign`) | `campaignId` incrémenté à `1`, `deadline = block.timestamp + duration`, statut `Active`, fonds à `0`, événement `CampaignCreated` émis. | Validé |
| **2.4** | Création avec objectif nul (`goal == 0`) | Refusé avec `"Goal must be > 0"`. | Validé |
| **2.5** | Création avec bénéficiaire nul (`address(0)`) | Refusé avec `"Beneficiary is zero address"`. | Validé |
| **2.6** | Création avec durée hors bornes (`< 1j` ou `> 90j`) | Refusé avec `"Invalid duration"`. | Validé |
| **2.7** | Création avec hash IPFS vide (`""`) | Refusé avec `"IPFS hash required"`. | Validé |
| **3.1** | Contributions multiples d'un même compte | `contributions`, `totalRaised` et `availableFunds` cumulés exactement ; événement `Contributed` émis avec calcul `cfdAmount = msg.value * 1000 / 1e18`. | Validé |
| **3.2** | Contributions invalides | Refus si campagne inexistante, montant nul (`0 ETH`) ou échéance dépassée (`"Campaign ended"`). | Validé |
| **3.3** | Finalisation (`finalizeCampaign`) et `refund` | Passage à `Failed` sous l'objectif après `deadline`, remboursement exact du contributeur et refus d'un second remboursement (`"Nothing to refund"`). | Validé |
| **3.4** | Contrôle d'accès `setFrozen` | Tout appel par une adresse autre que `governance` échoue avec `"Only governance"`. | Validé |

### Erreur dans le contrat Crowdfunding.sol concernant la fonction contribute. Le nom n'a pas ete mentionne donc il est ajoute et complie pour que les tests passent.

### Tests d'Intégration et Opérations Financières

| ID Test | Scénario testé | Résultat attendu | Statut |
| :--- | :--- | :--- | :--- |
| **3.1** | Contributions multiples et émission CFD | `contributions`, `totalRaised` et `availableFunds` cumulés exactement ; événement `Contributed` émis et CFD mintés avec succès sur le contrat token. | **Validé (✔)** |
| **3.2** | Contributions invalides | Refus si campagne inexistante, montant nul (`0 ETH`) ou échéance dépassée (`"Campaign ended"`). | **Validé (✔)** |
| **3.3** | Finalisation en échec (`Failed`) et remboursement | Passage à `Failed` sous l'objectif après `deadline`, remboursement exact du contributeur et refus d'un second remboursement. | **Validé (✔)** |
| **3.4** | Finalisation en réussite (`Successful`) | Passage automatique à `Successful` lorsque le total collecté atteint ou dépasse l'objectif fixé. | **Validé (✔)** |
| **3.5** | Contrôle d'accès `setFrozen` | Tout appel par une adresse autre que `governance` échoue avec `"Only governance"`. | **Validé (✔)** |


### 3. Resultats de l'exécution des tests
    1. Contrat CFDToken — Paramètres, Émission (Mint) et Accès
      ✔ 1.1 Doit initialiser correctement les paramètres et les rôles au déploiement (2844ms)
      ✔ 1.2 Doit refuser le déploiement si admin ou minter est l'adresse zéro (60ms)
      ✔ 1.3 Doit permettre uniquement au MINTER_ROLE de créer (mint) des CFD
      ✔ 1.4 Doit refuser un mint de 0 jeton ou vers l'adresse zéro
      ✔ 1.5 Doit activer automatiquement les voix (auto-délégation) dès la réception de CFD
      ✔ 1.6 Doit interdire la délégation des voix à une autre adresse
    2. Contrat Crowdfunding — Déploiement et Création de Campagnes
      ✔ 2.1 Doit initialiser correctement les constantes et rôles au déploiement
      ✔ 2.2 Doit refuser le déploiement si admin ou _cfdToken est l'adresse zéro (42ms)
      ✔ 2.3 Doit créer une campagne valide et enregistrer toutes ses informations
      ✔ 2.4 Doit refuser la création si l'objectif est nul (goal == 0)
      ✔ 2.5 Doit refuser la création si le bénéficiaire est l'adresse zéro
      ✔ 2.6 Doit refuser la création si la durée est hors des bornes (< 1 jour ou > 90 jours)
      ✔ 2.7 Doit refuser la création si le hash IPFS est vide
    3. Intégration Crowdfunding <-> CFDToken, Contributions et Remboursements
      ✔ 3.1 Doit enregistrer les contributions, cumuler les versements et émettre les CFD
      ✔ 3.2 Doit refuser une contribution de 0 ETH, sur une campagne inexistante ou après l'échéance (104ms)
      ✔ 3.3 Doit finaliser en Failed sous l'objectif, rembourser une seule fois et refuser un double remboursement
      ✔ 3.4 Doit finaliser en Successful lorsque l'objectif est atteint ou dépassé
      ✔ 3.5 Doit refuser l'appel à setFrozen par une adresse autre que la gouvernance

  18 passing (3s)