# CFDToken — rôle et fonctionnement dans notre projet

## À quoi sert notre contrat ?

`CFDToken.sol` gère les jetons associés aux campagnes de notre plateforme de crowdfunding. Lorsqu'une personne contribue en ETH, elle reçoit des CFD proportionnels au montant versé. Ces jetons lui donnent un poids dans les votes concernant la campagne financée.

Le contrat conserve les soldes, permet les transferts et garde l'historique du pouvoir de vote. Il permet aussi de détruire les jetons utilisés pour un remboursement.

Les ETH et les CFD ont deux rôles différents : les ETH financent la campagne ; les CFD représentent les droits associés à cette campagne. Les ETH sont gérés par Crowdfunding, pas par ce token.

## Comment l'utiliser dans notre application ?

Nous n'avons pas besoin de déployer manuellement un token global pour toute la plateforme. Lors de la création d'une campagne, Crowdfunding déploie une nouvelle instance de CFDToken et conserve son adresse dans les données de cette campagne.

Ensuite :

1. Une contribution acceptée entraîne un appel de `mint()` sur le token de la campagne.
2. Le contributeur reçoit ses CFD et ses voix sont activées automatiquement.
3. Il peut conserver ses jetons ou les transférer à une autre adresse.
4. Pour un vote, le pouvoir historique est consulté sur ce même token au bloc de snapshot retenu.
5. Si la campagne devient remboursable, Crowdfunding appelle `burn()` pour détruire les jetons correspondant aux ETH remboursés.

Le détenteur n'appelle pas `mint()` ou `burn()` lui-même : ces opérations sont réservées au contrôleur autorisé. Pour un remboursement, il appelle `refund()` dans Crowdfunding.

## Pourquoi un token par campagne ?

Un ERC-20 classique conserve un solde par adresse, sans distinguer l'origine de ses jetons. Un token commun mélangerait les CFD obtenus dans plusieurs campagnes.

Nous avons donc choisi une instance indépendante par campagne. Le même fichier Solidity sert de modèle, mais chaque déploiement possède une adresse, des soldes et un historique distincts.

| Opération | Conséquence |
| --- | --- |
| Alice reçoit 100 CFD de la campagne A | Elle obtient les droits correspondants sur A. |
| Alice n'a aucun CFD de B | Ses jetons de A ne donnent aucune voix dans B. |
| Alice transfère 30 CFD de A à Sara | Alice conserve 70 CFD de A et Sara reçoit 30 CFD de A. |

Ce choix rend la séparation des droits facile à comprendre. En contrepartie, chaque campagne paie le coût de déploiement de son token. Le nom et le symbole servent à l'affichage ; l'adresse du contrat distingue techniquement les tokens.

## Les règles que nous avons retenues

- Aucun CFD n'est créé au déploiement.
- La création et la destruction nécessitent des rôles spécifiques.
- Chaque token reste associé au même identifiant de campagne après son déploiement.
- Les jetons sont transférables.
- Les droits de vote futurs suivent les jetons.
- Chaque détenteur exerce ses propres voix ; la délégation à une autre adresse est interdite.
- Un transfert ou une destruction ne modifie pas les droits d'un ancien snapshot.

La règle de vote concerne donc le détenteur des CFD au snapshot, pas uniquement le contributeur initial. Une personne qui reçoit les jetons peut obtenir des droits sans avoir elle-même versé les ETH.

Dans la version actuelle de Crowdfunding, le droit au remboursement éventuel suit également les CFD. Cette règle doit être comprise avant un transfert : transmettre tous ses jetons revient aussi à transmettre ce droit.

## Les composants utilisés

Nous avons utilisé OpenZeppelin pour les mécanismes standards, puis ajouté les règles propres à notre projet.

| Composant | Utilité dans notre contrat |
| --- | --- |
| ERC20 | Soldes, offre totale, transferts et autorisations de dépense. |
| ERC20Votes | Historique du pouvoir de vote et lectures aux snapshots. |
| AccessControl | Contrôle des rôles de création, destruction et administration. |
| ERC20Permit | Autorisations de dépense par signature. Présent dans notre composition, mais pas nécessaire au vote ni au transfert direct. |
| Nonces | Compteurs utilisés par les signatures et résolution de l'héritage de `nonces()`. |

Ces composants sont compilés avec notre contrat. Leur utilisation ne donne aucun contrôle du token à OpenZeppelin.

## L'identité et les autorisations du token

### L'identifiant de campagne

`campaignId` indique la campagne associée à l'instance. Nous l'avons rendu `immutable` : il est fixé au déploiement et ne peut plus être modifié.

Cette variable décrit le rattachement du token. La séparation des soldes vient des instances distinctes, et Crowdfunding conserve la correspondance entre campagne et adresse de token.

### Les rôles

| Rôle | Permission |
| --- | --- |
| DEFAULT_ADMIN_ROLE | Administrer les rôles du token. |
| MINTER_ROLE | Créer des CFD avec `mint()`. |
| BURNER_ROLE | Détruire des CFD avec `burn()`. |

Les noms MINTER_ROLE et BURNER_ROLE sont transformés en identifiants de 32 octets avec `keccak256`. Ces identifiants sont publics : ce ne sont pas des mots de passe. Ce qui compte est l'appartenance d'une adresse au rôle.

Nous distinguons création et destruction pour rendre ces deux permissions explicites. Le même contrôleur reçoit actuellement les deux.

## Le but de chaque fonction

### 1. Le constructeur : préparer le token

Le constructeur s'exécute une fois, au déploiement. Il reçoit :

| Paramètre | Signification |
| --- | --- |
| name_ | Nom complet, par exemple CFD Campagne 1. |
| symbol_ | Symbole court, par exemple CFD-1. |
| campaignId_ | Identifiant de la campagne. |
| admin_ | Adresse administrant les rôles. |
| minter_ | Contrôleur initial qui reçoit les rôles de création et de destruction. |

Il refuse un administrateur ou un contrôleur nul, enregistre l'identifiant et attribue les rôles. Il ne crée aucun jeton : l'offre initiale vaut zéro.

Dans notre utilisation, Crowdfunding transmet sa propre adresse pour `admin_` et `minter_`. Il devient donc administrateur, minter et burner de chaque token créé.

L'administrateur humain de la plateforme ne reçoit pas automatiquement ces rôles dans le token. Le constructeur permet une autre configuration dans un déploiement manuel, mais notre application utilise celle décrite ci-dessus.

### 2. mint() : créer les CFD après une contribution

```solidity
mint(address to, uint256 amount)
```

Cette fonction crée une quantité de CFD pour le destinataire `to`. Elle vérifie que l'appelant possède MINTER_ROLE et refuse une quantité nulle. Le mécanisme OpenZeppelin refuse également un destinataire nul.

La création augmente le solde du destinataire et l'offre totale. Elle déclenche aussi la mise à jour des voix par `_update()`.

Le token ne reçoit pas les ETH et ne calcule pas le taux. Crowdfunding valide la contribution et lui transmet la quantité déjà calculée.

Exemple : Alice contribue 0,1 ETH. Au taux de 1 ETH = 1000 CFD défini dans Crowdfunding, celui-ci demande la création de 100 CFD pour Alice.

### 3. burn() : détruire les CFD correspondant à un remboursement

```solidity
burn(address from, uint256 amount)
```

Cette fonction détruit une quantité de jetons détenus par `from`. Elle est réservée à BURNER_ROLE, refuse zéro et utilise les contrôles OpenZeppelin contre une adresse nulle ou un solde insuffisant.

La destruction diminue le solde, l'offre totale et le pouvoir de vote actuel. Les anciens snapshots restent inchangés.

Aucune approbation du détenteur n'est demandée : le rôle de destruction donne ce pouvoir au contrôleur. C'est un choix volontaire pour le remboursement, mais le token ne vérifie pas lui-même que la campagne a échoué ou a été annulée. Crowdfunding vérifie cette condition avant l'appel.

Détruire les jetons empêche de conserver les mêmes droits pour réclamer plusieurs fois les fonds correspondants. Burn ne paie aucun ETH : le paiement est effectué par Crowdfunding dans la transaction de remboursement.

### 4. _update() : maintenir les soldes et les voix ensemble

Cette fonction interne est le point commun aux créations, transferts et destructions. Les utilisateurs ne l'appellent pas directement.

Elle conserve les mises à jour héritées d'OpenZeppelin, puis active les voix du destinataire si celui-ci reçoit une quantité positive et n'a pas encore de délégation.

Nous avons ajouté cette activation automatique pour que recevoir des CFD suffise à disposer de ses voix, sans transaction d'activation supplémentaire.

Exemple : Alice transfère 30 CFD à Sara pour la première fois. Les soldes sont mis à jour, les voix actuelles d'Alice diminuent et celles de Sara sont activées. Si Sara avait déjà activé ses voix, le mécanisme hérité les met directement à jour.

Une destruction n'a pas de destinataire réel : aucune activation n'est faite vers l'adresse nulle.

### 5. _delegate() : garder les voix chez le détenteur

Cette fonction interne contrôle l'adresse autorisée à exercer les voix d'un détenteur.

ERC20Votes permet normalement de confier ses voix à une autre adresse sans transférer ses jetons. Nous avons choisi de limiter la délégation à soi-même : pour transmettre ses droits futurs, il faut transférer les CFD.

| Demande | Résultat |
| --- | --- |
| Alice active les voix sur sa propre adresse | Autorisé. |
| Alice garde ses CFD mais délègue ses voix à Sara | Refusé. |
| Alice transfère ses CFD à Sara | Autorisé, avec transmission des droits futurs. |

Le contrôle est placé dans le mécanisme interne commun, ce qui couvre aussi les délégations par signature. Activer ses voix ne constitue pas un vote pour ou contre une proposition.

### 6. nonces() : consulter le compteur de signature

```solidity
nonces(address owner)
```

Cette fonction renvoie le nonce actuel d'une adresse. Elle résout aussi l'héritage commun entre les composants de signature utilisés.

Un nonce évite qu'une autorisation signée déjà consommée soit réutilisée. Par exemple, une autorisation utilise le numéro 0 ; après son acceptation, le compteur passe à 1 et la même signature ne peut plus être acceptée avec le numéro attendu.

La lecture du compteur ne le modifie pas. Il ne représente ni le nombre de jetons, ni les contributions, ni les votes. Il n'est pas utilisé directement dans notre parcours de vote ordinaire.

## Les fonctions disponibles sans les réécrire

Certaines fonctions viennent directement des composants hérités.

| Fonction | Utilisation |
| --- | --- |
| name(), symbol(), decimals() | Afficher l'identité et la précision du token. |
| balanceOf(address) | Lire le solde actuel. |
| totalSupply() | Lire la quantité totale de CFD existants. |
| transfer(to, amount) | Envoyer ses propres CFD. |
| approve(), allowance(), transferFrom() | Autoriser puis effectuer un transfert par un intermédiaire. |
| getVotes(address) | Lire le pouvoir de vote actuel. |
| getPastVotes(address, blockNumber) | Lire le pouvoir de vote historique. |
| getPastTotalSupply(blockNumber) | Lire l'offre totale historique. |
| hasRole(role, address) | Vérifier une permission. |

Une autorisation de dépense ne transfère pas les jetons ni les voix. Si un intermédiaire effectue ensuite un transfert autorisé, les jetons et les droits futurs suivent ce transfert.

## Les 18 décimales et les montants

Nous conservons les 18 décimales par défaut d'ERC-20 OpenZeppelin pour représenter les fractions de CFD avec des entiers.

```text
1 CFD = 10^18 petites unités CFD
```

Ainsi, transmettre `100` à mint ne crée pas 100 CFD, mais 100 petites unités. Pour représenter 100 CFD en JavaScript :

```javascript
ethers.parseUnits("100", 18)
```

Les décimales indiquent une précision, pas un prix. Le taux ETH/CFD appartient à Crowdfunding.

Pour le taux actuel de 1000 CFD par ETH, la quantité en petites unités se calcule avec `msg.value * CFD_RATE`, puisque msg.value est exprimé en wei et que les deux représentations ont 18 décimales.

## Comment comprendre les snapshots ?

Le pouvoir de vote actuel peut changer après un transfert. Pour une proposition donnée, nous avons besoin d'un poids fixé à un moment précis.

ERC20Votes conserve les changements dans des checkpoints. Il permet de retrouver les voix à la fin d'un bloc passé sans copier tous les soldes à chaque proposition.

| Moment | Alice | Sara |
| --- | ---: | ---: |
| Au bloc retenu pour le snapshot | 100 CFD | 0 CFD |
| Après un transfert de 30 CFD | 70 CFD | 30 CFD |

Pour une proposition utilisant ce snapshot ancien, Alice conserve un poids de 100 et Sara un poids de zéro. Pour un prochain snapshot, les nouveaux soldes pourront être retenus.

Une destruction ne réécrit pas non plus le passé. Le token fournit l'historique ; la gouvernance choisit le bloc passé applicable à chaque proposition et décide si la proposition est encore valide au regard de l'état de la campagne.

Un snapshot ne bloque pas les transferts et ne signifie pas que les jetons sont gelés. Il fixe uniquement la référence utilisée pour ce vote.

## Exemple de remboursement après un transfert

Alice contribue 1 ETH et reçoit 1000 CFD. Elle transfère 400 CFD à Sara. Si la campagne devient remboursable :

- Alice possède les droits correspondant à ses 600 CFD ;
- Sara possède les droits correspondant à ses 400 CFD ;
- Crowdfunding détruit les jetons utilisés et verse les ETH correspondants.

Le mapping des contributions initiales reste un historique. Il ne donne pas à Alice le droit de récupérer une seconde fois la partie dont elle a transféré les CFD.

Comme le paiement en ETH se fait en wei entiers, les petites fractions non encore remboursables restent dans le portefeuille. Elles peuvent être regroupées par transfert. Il faut détruire seulement la quantité correspondant aux wei effectivement versés, et pas forcément tout le solde.

## Les erreurs prévues

| Erreur | Signification |
| --- | --- |
| InvalidAddress | Adresse initiale de l'administrateur ou du contrôleur nulle. |
| ZeroMintAmount | Demande de création de zéro jeton. |
| ZeroBurnAmount | Demande de destruction de zéro jeton. |
| ExternalDelegationDisabled | Tentative de délégation à une autre adresse. |

Les composants hérités signalent également les permissions manquantes, les adresses invalides et les soldes insuffisants. Une opération refusée annule ses modifications d'état.

## Les événements utiles

Le contrat hérite notamment de `Transfer`, `Approval`, `RoleGranted`, `RoleRevoked`, `DelegateChanged` et `DelegateVotesChanged`.

Ces événements permettent de suivre les transferts, les autorisations et les changements de droits. Une création émet Transfer avec l'adresse nulle comme origine ; une destruction l'émet avec l'adresse nulle comme destination.

L'événement décrit une opération. Ce sont les contrôles dans les fonctions qui l'autorisent ou la refusent.

## Les tests de CFDToken

Le fichier `test/01_CFDToken.test.js` contient les 19 tests unitaires de notre contrat. Ils déploient des instances propres du token et utilisent des comptes locaux pour représenter l'administrateur, le contrôleur et les détenteurs.

| N° | Scénario vérifié |
| --- | --- |
| 1 | Nom, symbole, 18 décimales et identifiant de campagne. |
| 2 | Aucune création de jetons au déploiement. |
| 3 | Attribution des rôles aux adresses prévues. |
| 4 | Refus de création sans MINTER_ROLE. |
| 5 | Refus d'une création de zéro jeton. |
| 6 | Refus d'une création vers l'adresse nulle. |
| 7 | Création des jetons et activation automatique des voix. |
| 8 | Séparation des soldes et droits entre les campagnes. |
| 9 | Transfert des jetons et des voix dans la bonne campagne. |
| 10 | Conservation des voix historiques après transfert. |
| 11 | Refus de la délégation externe. |
| 12 | Refus du déploiement avec administrateur ou contrôleur nul. |
| 13 | Attribution initiale de BURNER_ROLE. |
| 14 | Destruction autorisée et diminution du solde, de l'offre et des voix. |
| 15 | Refus de destruction sans BURNER_ROLE. |
| 16 | Refus d'une destruction de zéro jeton. |
| 17 | Refus d'une destruction supérieure au solde. |
| 18 | Refus d'une destruction depuis l'adresse nulle. |
| 19 | Conservation des anciens snapshots après destruction. |

Lors de notre dernière exécution locale, ces 19 tests ont réussi.

Pour compiler puis exécuter uniquement cette suite depuis la racine du projet :

```powershell
npm run build
npm test -- --grep "^J2 - CFDToken"
```

Le résultat attendu pour cette version est `19 passing`. Un résultat `0 passing` indique qu'aucun test n'a été sélectionné. Le message `No contracts to compile` signifie simplement qu'Hardhat n'a rien de nouveau à compiler.

## Les limites du contrat à connaître

CFDToken ne décide pas du succès d'une campagne, ne conserve pas son échéance et n'autorise pas un retrait de fonds. Il ne contient pas de pause propre : la pause de Crowdfunding ne bloque donc pas automatiquement les transferts du token.

Les transferts restent possibles après la fin de la campagne. Aucun mécanisme ne détruit automatiquement tous les CFD au succès ou au paiement du bénéficiaire.

Le token ne possède pas de plafond économique de création ajouté par notre code. Les quantités créées dépendent du contrôleur autorisé et de ses règles. Les rôles doivent rester attribués aux bonnes adresses.

Enfin, modifier le fichier et le pousser sur GitHub ne change pas une instance déjà déployée sur la blockchain. Notre contrat n'est pas conçu comme un contrat modifiable en place : une nouvelle version du code exige un nouveau déploiement.
