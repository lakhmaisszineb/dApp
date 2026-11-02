# Frontend — Contribution et gouvernance

Ce dossier contient l’interface React de notre plateforme de crowdfunding. Elle communique avec nos contrats via Ethers et utilise MetaMask pour demander la confirmation des transactions.

Ce guide décrit la version développée et vérifiée en local. Il est destiné à être placé dans `frontend/README.md`.

## 1. Ce qui est réalisé

| Fonctionnalité | Comportement |
|---|---|
| Connexion MetaMask | Affichage du compte autorisé et du réseau, avec changement vers Hardhat local. |
| État de la plateforme | Lecture des compteurs de campagnes, propositions et transactions multisig, ainsi que de la pause. Vérification des liens entre contrats. |
| Consultation d’une campagne | Chargement par identifiant, objectif, montant collecté, échéance, statut et gel. |
| Contribution | Envoi d’ETH via MetaMask, attente de confirmation et lecture du solde CFD obtenu. |
| Création de propositions | Autorisation de retrait, gel, dégel et annulation. |
| Consultation des propositions | Liste des 20 dernières propositions et accès à une proposition par identifiant. |
| Vote | Pour ou contre, avec poids CFD historique et prévention du double vote par le contrat. |
| Exécution | Déclenchement d’une décision adoptée après les délais et vérification de son effet sur la campagne. |

Les essais manuels réalisés incluent une contribution, un vote contre une annulation, un vote pour le gel, son exécution, puis le dégel. Les 34 tests Hardhat de gouvernance ont également passé dans notre environnement de développement.

Cela ne signifie pas que tous les parcours de l’application sont terminés ou audités.

### Ce qui reste à intégrer

- Les pages de création et d’affichage des campagnes développées par l’autre membre de l’équipe.
- Une navigation commune : choisir une campagne sans saisir manuellement son identifiant.
- Une gestion partagée du portefeuille entre les composants et un design commun.
- Les actions de gestion financière dans les pages appropriées : demande de retrait, retrait et remboursement.
- L’interface de confirmation des signataires multisig et la vérification de ce parcours complet depuis le site.

Le menu « Autoriser le retrait » crée une proposition de gouvernance. Il ne crée pas la demande financière préalable et ne verse pas les ETH au bénéficiaire.

## 2. Comment les éléments communiquent

| Élément | Responsabilité |
|---|---|
| React + Vite | Afficher les informations et les formulaires. |
| Ethers 6 | Lire les contrats et préparer les appels. |
| MetaMask | Gérer le compte et demander la signature des transactions. |
| Crowdfunding | Campagnes, ETH, contributions, remboursements et retraits. |
| CFDToken | Une instance par campagne : soldes, transferts et historique des voix. |
| Governance | Propositions, votes, quorum et exécution des décisions. |
| MultiSig | Appels et trésorerie contrôlés par deux signataires sur trois. |
| Backend IPFS | Recevoir les métadonnées et l’image, puis les envoyer sur IPFS via Pinata. |

Les lectures de la plateforme utilisent `VITE_RPC_URL`. Les écritures passent par le réseau sélectionné dans MetaMask. Les deux doivent viser le même nœud local.

L’adresse d’un contrat indique où il est déployé. Son ABI décrit les fonctions, paramètres, résultats et événements qu’Ethers utilise pour communiquer avec lui. Les ABI sont publiques et ne contiennent aucune clé privée.

## 3. Organisation des fichiers

```text
frontend/
  src/
    App.jsx
    components/
      WalletConnection.jsx
      PlatformStatus.jsx
      ContributionForm.jsx
      GovernanceDashboard.jsx
    services/
      contracts.js
      governance.js
    contracts/
      deployment.json
      Crowdfunding.json
      Governance.json
      MultiSig.json
      CFDToken.json
  .env.example
  .env                 # configuration locale, non publiée
  package.json
  package-lock.json
```

- `App.jsx` assemble les composants.
- `WalletConnection.jsx` gère la connexion, le compte et le réseau.
- `PlatformStatus.jsx` lit l’état général des contrats.
- `ContributionForm.jsx` charge une campagne et envoie une contribution.
- `GovernanceDashboard.jsx` permet de proposer, consulter, voter et exécuter.
- `services/contracts.js` centralise les contrats en lecture et avec signer, ainsi que les opérations de contribution.
- `services/governance.js` centralise les lectures et transactions de gouvernance.
- `src/contracts/` est généré par `scripts/deploy-local.js`, depuis la racine du dépôt.

Ne modifiez pas les ABI à la main. Après modification des contrats, recompilez et actualisez le déploiement utilisé par le frontend.

## 4. Prérequis sur chaque ordinateur

- Node.js 24 et npm ; notre développement utilise Node.js `24.15.0`.
- Git et VS Code.
- MetaMask installé dans le profil Chrome ou Firefox utilisé pour ouvrir le site.
- Une copie à jour du dépôt.

Vérifier :

```powershell
node --version
npm --version
git --version
```

`localhost` désigne votre propre ordinateur. Les campagnes créées sur le nœud de Fatima ne sont pas automatiquement présentes sur celui d’un autre membre.

Pour commencer, chaque membre peut exécuter sa propre instance locale. Un nœud partagé demanderait une configuration réseau distincte, qui n’est pas décrite ici.

## 5. Récupérer et installer le projet

Pour une première récupération, depuis le dossier parent choisi :

```powershell
git clone https://github.com/lakhmaisszineb/dApp.git
cd dApp
```

Si vous possédez déjà une copie, récupérez les changements selon votre procédure Git habituelle. Conservez ou commitez vos modifications locales avant de changer de branche ou de fusionner.

Installer les dépendances des contrats, depuis la racine `dApp` :

```powershell
npm ci
```

Installer le frontend :

```powershell
cd frontend
npm ci
```

Installer le backend, si vous utilisez l’envoi IPFS :

```powershell
cd ../backend
npm ci
cd ..
```

Chaque dossier possède son propre `package.json`. Installer à la racine n’installe pas automatiquement les dépendances du frontend et du backend.

## 6. Configurer les environnements

### A. Hardhat, à la racine

Si `.env` n’existe pas et que `.env.example` est disponible :

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Notre configuration définit `localhost` avec `http://127.0.0.1:8545` et conserve `viaIR: true` avec l’optimiseur. Les paramètres Sepolia ne sont pas utilisés pour ce parcours local. Ne recopiez aucune clé privée personnelle dans le frontend.

### B. Frontend

Depuis `frontend`, créer `.env` s’il n’existe pas :

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
code .env
```

Configuration :

```dotenv
VITE_CHAIN_ID=31337
VITE_RPC_URL=http://127.0.0.1:8545
VITE_API_URL=http://127.0.0.1:3001
VITE_PINATA_GATEWAY=https://VOTRE-DOMAINE.mypinata.cloud
```

Remplacer le domaine par celui de la passerelle choisie. Cette valeur est une adresse de base, sans `/ipfs/` à la fin. Les variables sont disponibles pour l’intégration des pages ; toutes ne sont pas encore utilisées par les composants de contribution et gouvernance.

Toutes les variables `VITE_` sont publiques dans le navigateur. Aucun JWT Pinata, secret ou clé privée ne doit y figurer. Redémarrer Vite après modification du `.env`.

### C. Backend IPFS

Depuis `backend`, copier `.env.example` vers `.env` seulement si ce fichier n’existe pas, puis compléter :

```dotenv
PINATA_JWT=VOTRE_JWT_SECRET
PINATA_GATEWAY=VOTRE-DOMAINE.mypinata.cloud
PORT=3001
HOST=127.0.0.1
FRONTEND_ORIGIN=http://localhost:5173
```

Le domaine backend est sans `https://` ni `/ipfs/`. Le JWT doit autoriser l’écriture des fichiers publics dans Pinata. Il reste uniquement côté backend.

Le backend n’est pas nécessaire pour lire les contrats, contribuer ou voter. Il est nécessaire pour l’envoi des métadonnées lors de la création via le futur formulaire.

## 7. Démarrer les serveurs

Ouvrir des terminaux séparés et les laisser actifs :

| Terminal | Dossier | Commande | Port |
|---|---|---|---|
| 1 — Blockchain | `dApp` | `npx hardhat node` | 8545 |
| 2 — Backend IPFS | `dApp/backend` | `npm run dev` | 3001 |
| 3 — Frontend | `dApp/frontend` | `npm run dev -- --port 5173 --strictPort` | 5173 |
| 4 — Commandes | `dApp` | Compilation et déploiement ci-dessous | — |

Dans le terminal 4, après démarrage du nœud :

```powershell
npm run build
npx hardhat run scripts/deploy-local.js --network localhost
```

Le script déploie Crowdfunding, Governance et MultiSig, configure leurs liens et exporte les adresses et les quatre ABI dans `frontend/src/contracts/`.

Il choisit le premier compte Hardhat comme administrateur et les trois suivants comme signataires. Ce sont des comptes de développement, pas automatiquement les comptes personnels de l’équipe.

CFDToken n’est pas déployé une seule fois au démarrage : Crowdfunding déploie un nouveau token pour chaque campagne.

Ouvrir ensuite **http://localhost:5173** dans le navigateur possédant MetaMask. Le navigateur intégré de VS Code peut ne pas disposer de l’extension.

Le bloc « État de la plateforme » doit confirmer que les contrats sont accessibles et correctement reliés. Un déploiement neuf affiche des compteurs à zéro.

### Attention aux redémarrages

Un redémarrage ordinaire du nœud Hardhat remet son état à zéro. Il faut redéployer, puis recharger le frontend. Les campagnes et propositions précédentes n’existent plus sur ce nouveau réseau local.

Relancer `deploy-local.js` sur un nœud encore actif crée aussi une nouvelle plateforme et remplace les références exportées. Ne le relancez pas pour simplement actualiser l’interface.

## 8. Connecter MetaMask

Ajouter ou sélectionner le réseau :

```text
Nom : Hardhat Local
RPC : http://127.0.0.1:8545
Chain ID : 31337
Symbole : ETH
```

Sur le site : cliquer sur « Connecter MetaMask », autoriser le compte et sélectionner Hardhat. Le compte et l’identifiant `31337` doivent apparaître.

La connexion ne coûte pas de gas. En revanche, une création, contribution, proposition, un vote ou une exécution nécessite des ETH locaux pour payer le gas.

Le message « Réseau Hardhat sélectionné » indique l’identifiant choisi ; le bloc d’état des contrats confirme séparément l’accès au nœud.

## 9. Disposer d’une campagne et d’ETH locaux

Sur un réseau neuf, saisir `1` ne crée pas une campagne : cela essaie de lire la campagne 1.

Deux possibilités : utiliser la page de création lorsqu’elle sera intégrée, ou utiliser notre script de préparation locale.

### Script de préparation

Le script `scripts/prepare-contribution.js` :

1. Lit les adresses dans `frontend/src/contracts/deployment.json`.
2. Lit une vraie `metadataURI` dans `backend/output/campaign-api-result.json`.
3. Crée une campagne de 30 jours, objectif 2 ETH.
4. Définit `TEST_ACCOUNT` comme bénéficiaire.
5. Envoie 10 ETH locaux à cette adresse depuis un compte Hardhat.

Avant de lancer :

- Ouvrir le script et remplacer `TEST_ACCOUNT` par l’adresse publique du compte MetaMask qui servira aux essais. L’adresse présente initialement est celle utilisée par Fatima ; ne la conserver que si c’est réellement votre compte de test.
- Vérifier que `backend/output/campaign-api-result.json` existe. Ce dossier est ignoré par Git : il ne sera pas présent après un simple clone.

Pour obtenir ce fichier, effectuer l’envoi de test décrit dans la documentation du backend, ou créer le fichier avec la référence publique réelle de métadonnées déjà envoyées par l’équipe :

```json
{
  "metadataURI": "ipfs://REMPLACER_PAR_LE_VRAI_CID_DU_JSON"
}
```

Cette référence doit viser le JSON de métadonnées, pas directement l’image. La lecture du fichier JSON est utilisée par le script ; celui-ci ne valide pas son contenu sur IPFS.

Depuis `dApp` :

```powershell
code scripts/prepare-contribution.js
npx hardhat run scripts/prepare-contribution.js --network localhost
```

Noter l’identifiant retourné. Chaque exécution crée une nouvelle campagne et envoie 10 ETH locaux supplémentaires : ne pas relancer inutilement.

Ces ETH n’ont aucune valeur sur les réseaux publics. Ne jamais utiliser les clés de test Hardhat pour conserver des fonds réels. Le script n’a pas besoin de la clé privée de votre compte MetaMask : son adresse publique suffit pour recevoir les ETH locaux.

## 10. Tester la contribution

1. Connecter le compte financé sur Hardhat.
2. Saisir l’identifiant retourné par le script, puis charger la campagne.
3. Vérifier l’objectif, l’échéance et l’absence de gel et de pause.
4. Saisir `0.1`, avec un point comme séparateur.
5. Cliquer sur « Contribuer avec MetaMask » et confirmer.
6. Attendre le message de confirmation.

Avec le taux du contrat, 1 ETH donne 1000 CFD ; 0,1 ETH donne 100 CFD. Le compte paie aussi le gas en ETH. Les tokens reçus appartiennent uniquement à cette campagne.

Le statut peut rester Active après atteinte de l’objectif. Le contrat finalise après l’échéance ou ferme la collecte lors d’une demande de retrait anticipé admissible.

Le frontend masque la contribution si les conditions ne sont pas réunies, et Crowdfunding applique aussi ces contrôles on-chain.

## 11. Tester la gouvernance

### Créer et voter

1. Utiliser un compte possédant des CFD de la campagne.
2. Saisir l’identifiant de campagne dans la création de proposition.
3. Choisir « Geler la campagne » et confirmer dans MetaMask.
4. Noter l’identifiant de proposition, distinct de celui de campagne.
5. Consulter la proposition et voter pour.

Le snapshot utilise le bloc précédant la création. Le quorum représente 20 % de l’offre historique, arrondi vers le haut. La majorité doit être stricte : pour > contre. Pour et contre comptent dans la participation.

Une adresse ne vote qu’une fois par proposition. Voter ne dépense pas les CFD. Les transferts ultérieurs ne modifient pas le poids de cette proposition.

Le vote reste ouvert pendant trois jours, même si le quorum est déjà atteint. Une proposition adoptée ne peut être exécutée qu’après un jour supplémentaire. L’exécution nécessite un appel séparé ; elle n’est pas automatique.

### Avancer le temps pour les essais locaux

Uniquement sur le nœud Hardhat local, après avoir voté, exécuter une fois dans PowerShell :

```powershell
$advance = @{
    jsonrpc = "2.0"
    method = "evm_increaseTime"
    params = @(345601)
    id = 1
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post -ContentType "application/json" -Body $advance

$mine = @{
    jsonrpc = "2.0"
    method = "evm_mine"
    params = @()
    id = 2
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post -ContentType "application/json" -Body $mine
```

Cela avance le temps de toutes les campagnes et propositions du nœud de quatre jours et une seconde. Cela peut terminer d’autres campagnes. Ne pas répéter sans raison.

Recharger la même proposition, vérifier « Adoptée », exécuter et confirmer dans MetaMask. Recharger ensuite la campagne : elle doit afficher « Campagne gelée : Oui » et refuser les contributions.

Ne pas créer une nouvelle proposition à la place de l’exécution : toute nouvelle proposition possède de nouveaux délais.

Pour dégeler, créer une proposition de dégel, voter pour et répéter le parcours sur cette nouvelle proposition. Les contributions reprennent si la campagne est encore Active, avant son échéance et sans pause.

Une proposition peut être adoptée mais devenir inexécutable : par exemple un second gel alors que la campagne est déjà gelée. Le contrat revérifie ses conditions à l’exécution.

### Retrait et multisig

Le bénéficiaire doit d’abord appeler `requestWithdrawal()` dans Crowdfunding. Ensuite seulement, il peut proposer l’autorisation du retrait. La demande doit déjà exister avant le vote.

La gouvernance adoptée appelle `authorizeWithdrawal()`. Si le brut dépasse strictement 0,5 ETH, il faut également l’approbation du MultiSig. Celui-ci soumet un appel à `approveWithdrawalMultiSig(campaignId)` avec `value = 0`, reçoit deux confirmations distinctes, puis exécute l’appel. La soumission vaut déjà première confirmation.

Enfin, le bénéficiaire appelle `withdrawFunds()`. Le vote seul n’envoie pas les ETH. Le tableau de bord actuel ne fournit pas encore toute l’interface financière et multisig.

## 12. Intégration avec les pages des campagnes

- Utiliser les mêmes contrats de `deployment.json` et le même réseau.
- La page de création envoie d’abord le formulaire à `POST /api/campaign-metadata`, puis utilise `metadataURI` dans `createCampaign` via MetaMask.
- Afficher les montants et états depuis Crowdfunding ; lire titre, description et image depuis IPFS.
- Ne jamais importer le JWT Pinata dans React.
- Éviter de dupliquer les connexions : centraliser le portefeuille lors de l’intégration.
- Rafraîchir les données concernées après confirmation des transactions. Le compteur général et les autres composants ne s’actualisent pas tous automatiquement actuellement.
- Relier la campagne sélectionnée au formulaire et aux propositions pour remplacer la saisie manuelle des identifiants.

## 13. Commandes de vérification

Depuis `frontend` :

```powershell
npm run build
npm audit --omit=dev
```

La compilation a réussi dans notre environnement. L’audit hors dépendances de développement n’y signalait aucune vulnérabilité ; six alertes modérées concernaient la chaîne ESLint/minimatch. Relancer l’audit sur votre installation : les résultats peuvent évoluer. Ne pas utiliser `npm audit fix --force` sans analyser les changements.

Depuis `dApp`, pour les tests de gouvernance :

```powershell
npm test -- --grep "^J3 - Governance"
```

Ces tests utilisent leur propre environnement de test et ne remplacent pas les essais de l’interface sur localhost. `npm run build` dans frontend vérifie la compilation, pas tous les parcours utilisateur.

## 14. Problèmes fréquents

| Problème | Action |
|---|---|
| MetaMask non détecté | Ouvrir le site dans le profil du navigateur où l’extension est activée, puis recharger. |
| Port 5173 déjà utilisé | Utiliser le serveur Vite existant, ou l’arrêter dans son terminal avant de le relancer. |
| Impossible de contacter Hardhat | Vérifier que le nœud tourne et que le RPC est `http://127.0.0.1:8545`. |
| Contrat absent après redémarrage | Redéployer une fois et recharger le frontend ; les anciennes données locales sont perdues. |
| Campagne inexistante | Vérifier son identifiant et le déploiement courant. Créer une campagne ne se fait pas en saisissant un numéro. |
| Solde ETH insuffisant | Financer le compte sur le réseau local ; aucun achat d’ETH réel n’est nécessaire. |
| Aucun pouvoir de vote | Vérifier le compte et ses voix au snapshot de cette campagne. |
| Bouton d’exécution désactivé | Charger la bonne proposition, vérifier résultat, délai, connexion et état de la campagne. |
| Campagne encore non gelée | Voter ne suffit pas : exécuter la décision puis recharger la campagne. |
| Configuration `.env` modifiée sans effet | Redémarrer Vite. |
| Avertissement de bundle supérieur à 500 kB | La compilation peut réussir malgré l’avertissement ; optimisation du chargement à prévoir. |

## 15. Fichiers à partager

Partager les sources, les scripts, `.env.example`, `package.json` et `package-lock.json`. Les ABI et les adresses exportées sont publiques, mais les adresses de déploiement local doivent correspondre au nœud utilisé.

Ne pas publier `.env`, les clés privées, le JWT Pinata, `node_modules/` ou les résultats locaux de `backend/output/`.

La configuration actuelle est destinée au développement local. Avant de publier le backend IPFS sur Internet, ajouter un contrôle d’accès aux envois et adapter l’hébergement et les limites. CORS n’est pas une authentification.
