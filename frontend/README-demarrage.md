# Tiwizi — Guide de démarrage de l’équipe

Tiwizi est notre plateforme de financement participatif. Un créateur publie une campagne, les contributeurs la financent en ETH et reçoivent les CFD propres à cette campagne. Ces jetons permettent de participer à sa gouvernance.

Ce guide décrit comment récupérer le projet, configurer les services et retrouver l’interface sur son ordinateur. Les commandes sont écrites pour Windows avec PowerShell, dans le terminal de VS Code.

## 1. Comprendre les différentes parties

| Partie | Rôle |
| --- | --- |
| `contracts/` | Contrats CFDToken, Crowdfunding, Governance et MultiSig. Ils imposent les règles financières et les permissions. |
| `scripts/deploy-local.js` | Déploie et relie les contrats, puis exporte leurs adresses et leurs ABI pour le frontend. |
| `backend/` | Reçoit les informations d’un projet et publie son image et ses métadonnées sur IPFS avec Pinata. |
| `frontend/` | Interface React : accueil, portefeuille, campagnes, création, détail d’un projet, contribution et gouvernance. |
| `frontend/src/contracts/` | ABI et fichier `deployment.json` utilisés pour contacter les contrats déployés. |
| `test/` | Tests des contrats. |

La blockchain enregistre l’objectif, le créateur, le bénéficiaire, l’échéance, les montants, le statut et la référence IPFS. Le titre, la description, la catégorie, l’image et l’utilisation prévue des fonds sont conservés sur IPFS. Les fichiers IPFS publics restent accessibles publiquement.

## 2. Préparer son ordinateur

Il faut disposer de :

- Git ;
- Node.js 24 et npm ;
- VS Code ;
- MetaMask installé dans le navigateur utilisé pour ouvrir Tiwizi ;
- un accès Internet pour installer les dépendances et contacter Pinata/IPFS.

Vérifier les installations :

```powershell
git --version
node --version
npm --version
```

Le dossier `.venv` Python éventuellement présent n’est pas nécessaire au frontend, au backend Node ou à Hardhat.

## 3. Récupérer le projet

Pour une première installation, dans le dossier où vous souhaitez placer le projet :

```powershell
git clone https://github.com/lakhmaisszineb/dApp.git
cd dApp
code .
```

Si le dépôt est déjà présent, ouvrir son dossier et vérifier les modifications avant la mise à jour :

```powershell
git status
```

Si le dossier de travail est propre, récupérer les changements :

```powershell
git pull --ff-only
```

Si des modifications personnelles sont présentes, les sauvegarder avant de récupérer celles du groupe. Ne pas utiliser de commande de réinitialisation pour les supprimer.

Dans la suite, « racine » désigne le dossier `dApp` contenant `hardhat.config.js`, `contracts`, `frontend`, `backend` et le `package.json` principal.

## 4. Installer les dépendances

Depuis la racine :

```powershell
npm ci
npm --prefix backend ci
npm --prefix frontend ci
```

Chaque commande utilise le fichier `package-lock.json` correspondant. Ne pas copier les dossiers `node_modules` d’un autre ordinateur.

Si `npm ci` signale un désaccord avec `package.json`, conserver le message et vérifier les fichiers avec l’équipe plutôt que supprimer directement le verrouillage des versions.

## 5. Configurer le backend

Créer le fichier de configuration s’il n’existe pas :

```powershell
if (-not (Test-Path ".\backend\.env")) {
    New-Item -ItemType File ".\backend\.env" | Out-Null
}
code ".\backend\.env"
```

Y placer :

```dotenv
PINATA_JWT=VOTRE_JWT_PINATA
PINATA_GATEWAY=gateway.pinata.cloud
FRONTEND_ORIGIN=http://localhost:5173
PORT=3001
HOST=127.0.0.1
```

Remplacer `VOTRE_JWT_PINATA` par une véritable autorisation Pinata permettant l’envoi de fichiers publics. Le domaine de la passerelle personnelle Pinata peut remplacer `gateway.pinata.cloud`.

Pour le backend, `PINATA_GATEWAY` contient seulement le domaine : pas de `https://`, pas de chemin et pas de slash final.

Le JWT reste dans le backend. Ne jamais l’ajouter au frontend, dans une capture d’écran ou dans un commit. Utiliser une clé personnelle ou une clé d’équipe distribuée par un canal privé.

Sans configuration Pinata valide, l’envoi de nouveaux projets peut échouer même si la blockchain fonctionne.

## 6. Configurer le frontend

Créer le fichier s’il n’existe pas :

```powershell
if (-not (Test-Path ".\frontend\.env")) {
    New-Item -ItemType File ".\frontend\.env" | Out-Null
}
code ".\frontend\.env"
```

Contenu :

```dotenv
VITE_CHAIN_ID=31337
VITE_RPC_URL=http://127.0.0.1:8545
VITE_API_URL=http://localhost:3001
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
```

Le frontend attend une URL complète pour la passerelle, avec `https://`. Si une passerelle personnelle est utilisée, renseigner son URL ici.

Les variables préfixées `VITE_` sont publiques : ne jamais y placer de JWT Pinata ni de clé privée.

Enregistrer les fichiers en UTF-8. Après modification du `.env`, redémarrer le service concerné. Les valeurs Sepolia ne sont pas nécessaires pour ce démarrage sur votre ordinateur.

## 7. Démarrer les services dans le bon ordre

Utiliser quatre terminaux. Dans VS Code, le bouton `+` du panneau Terminal permet d’en ouvrir un nouveau. Chaque commande ci-dessous part de la racine du projet.

### Terminal 1 — Blockchain

```powershell
npx hardhat node
```

Laisser ce terminal ouvert. Il affiche l’adresse RPC et les comptes fournis par Hardhat, avec leurs clés privées et des ETH fictifs.

### Terminal 2 — Déploiement

```powershell
npx hardhat run scripts/deploy-local.js --network localhost
```

Le script déploie Crowdfunding, Governance et MultiSig, configure leurs liens et exporte les ABI et `deployment.json` dans `frontend/src/contracts`.

CFDToken est déployé automatiquement par Crowdfunding pour chaque nouvelle campagne. Il n’est pas nécessaire de déployer manuellement un token commun.

Attendre le message de réussite avant de poursuivre. Ne pas recopier les anciennes adresses de contrats à la main.

### Terminal 3 — Backend IPFS

```powershell
npm --prefix backend start
```

Laisser ce terminal ouvert. Ouvrir :

[http://localhost:3001/api/health](http://localhost:3001/api/health)

Réponse attendue :

```json
{
  "status": "ok",
  "service": "crowdfunding-ipfs-backend"
}
```

Ce contrôle vérifie que le serveur répond ; il ne valide pas à lui seul les identifiants Pinata ni un envoi IPFS.

### Terminal 4 — Interface

```powershell
npm --prefix frontend run dev -- --port 5173 --strictPort
```

Ouvrir dans le navigateur disposant de MetaMask :

[http://localhost:5173](http://localhost:5173)

Utiliser `localhost`, comme dans `FRONTEND_ORIGIN`. L’origine `http://127.0.0.1:5173` est différente pour CORS.

| Service | Adresse | Doit rester actif ? |
| --- | --- | --- |
| Blockchain Hardhat | `http://127.0.0.1:8545` | Oui |
| Script de déploiement | Terminal 2 | Non, il se termine après l’export |
| Backend | `http://localhost:3001` | Oui |
| Frontend | `http://localhost:5173` | Oui |

## 8. Connecter MetaMask

Ajouter ou sélectionner le réseau suivant :

| Paramètre | Valeur |
| --- | --- |
| Nom | Hardhat Local |
| URL RPC | `http://127.0.0.1:8545` |
| Identifiant de chaîne | `31337` |
| Symbole | `ETH` |

Importer dans MetaMask un compte à partir d’une clé privée affichée dans le terminal Hardhat. Utiliser uniquement ces comptes pour les essais locaux : leurs clés sont publiques et ne doivent jamais recevoir de fonds réels.

Un compte personnel habituel peut afficher zéro ETH sur cette blockchain. Les comptes fournis par Hardhat possèdent les ETH fictifs nécessaires aux transactions.

Ouvrir « Mon portefeuille » dans Tiwizi et cliquer sur « Connecter mon portefeuille ». Vérifier l’adresse sélectionnée. Le compte est partagé entre les pages ; un changement de compte dans MetaMask met l’adresse affichée à jour.

La connexion au portefeuille ne réalise pas automatiquement une transaction. Une confirmation distincte est demandée pour publier, contribuer ou voter.

## 9. Utiliser la plateforme

### Créer un projet

1. Cliquer sur « Créer un projet » dans le menu ou sur l’accueil.
2. Renseigner le nom, le résumé, la description, la catégorie et l’utilisation des fonds.
3. Choisir une image JPEG ou PNG de 5 Mo maximum.
4. Indiquer un objectif positif en ETH, une durée de 1 à 90 jours et une adresse bénéficiaire correcte.
5. Cliquer sur « Prévisualiser mon projet » et relire les informations.
6. Connecter le portefeuille sur le réseau configuré, puis publier.
7. Attendre l’envoi de l’image et du JSON sur IPFS, puis confirmer la création dans MetaMask.
8. Attendre la confirmation de la transaction avant de quitter la page.

La durée commence à la confirmation de création. Les paramètres et la référence IPFS ne sont pas modifiables par le formulaire après publication. Les frais de plateforme sont de 3 % au retrait ; les frais réseau sont distincts.

Si l’envoi IPFS réussit mais que la transaction est refusée, les fichiers peuvent déjà exister sur Pinata. Le formulaire réutilise la référence tant que la page reste ouverte et que la présentation n’est pas modifiée.

### Consulter un projet

Ouvrir « Les projets », puis « Découvrir le projet » sur une carte. La fiche affiche l’image, la description, l’utilisation des fonds, le financement, l’échéance et les adresses associées.

Une ancienne campagne utilisant une référence de démonstration ou un JSON sans présentation peut s’afficher sous le nom `Campagne #…`. Une passerelle indisponible n’efface pas les données financières conservées dans le contrat.

### Contribuer

Depuis la fiche du projet, connecter le compte, saisir un montant en ETH puis confirmer. Il n’est pas nécessaire de recopier l’identifiant dans ce formulaire.

Le taux du contrat est de 1 ETH pour 1000 CFD. Chaque campagne possède son propre token. La contribution peut être refusée si la campagne est terminée, gelée ou si la plateforme est en pause.

Après l’envoi, conserver la référence de transaction. Si la confirmation est incertaine, consulter l’activité MetaMask avant de recommencer pour éviter un double versement.

### Gouvernance

Ouvrir la page « Gouvernance ». Dans l’interface actuelle, sélectionner ou charger la campagne/proposition demandée par le formulaire.

Les voix dépendent du solde enregistré au snapshot, pas uniquement du solde actuel. Les CFD d’une campagne ne donnent pas de voix dans une autre. Un transfert après le snapshot ne modifie pas les voix déjà enregistrées pour cette proposition.

Le contrat prévoit une période de vote de trois jours et un délai supplémentaire d’un jour avant exécution. Une proposition adoptée nécessite encore une transaction d’exécution. L’état de la campagne est revérifié à ce moment-là.

Une demande de retrait doit exister avant de proposer son autorisation. Les retraits supérieurs à 0,5 ETH brut nécessitent aussi l’approbation du multisig.

## 10. Ce qui est partagé entre les ordinateurs

GitHub partage les fichiers du projet. Il ne partage pas l’état de votre nœud Hardhat.

Chaque membre qui démarre Hardhat sur son ordinateur utilise sa propre blockchain. Il doit déployer les contrats et créer ses propres campagnes. Même si deux machines affichent les mêmes adresses de déploiement, leurs états restent indépendants.

Les fichiers IPFS peuvent être accessibles depuis plusieurs machines, mais leur référence doit être enregistrée dans une campagne sur la blockchain utilisée.

Pour travailler sur les mêmes campagnes depuis plusieurs ordinateurs, il faudra utiliser un réseau partagé et les mêmes contrats déployés, par exemple Sepolia, avec une configuration commune. Ce guide ne réalise pas ce déploiement public.

## 11. Reprendre le projet un autre jour

Après arrêt puis redémarrage de `npx hardhat node`, l’état local est réinitialisé : les campagnes précédentes et les déploiements ne sont pas conservés par cette commande.

1. Redémarrer le nœud.
2. Relancer `scripts/deploy-local.js`.
3. Redémarrer le backend et le frontend.
4. Actualiser le navigateur.
5. Recréer les campagnes nécessaires.

Si MetaMask signale un nonce incohérent après réinitialisation de la blockchain, vérifier d’abord le compte, le réseau et les transactions en attente ; l’historique du compte local peut devoir être réinitialisé dans MetaMask. Ne pas supprimer le portefeuille.

## 12. Vérifier le code

Depuis la racine :

```powershell
npm run build
npm --prefix frontend run lint
npm --prefix frontend run build
```

Pour les suites du token et de la gouvernance :

```powershell
npx hardhat test mocha test/01_CFDToken.test.js test/02_Governance.test.js
```

`npm test` lance l’ensemble des tests du dépôt. Un ancien test utilisant un constructeur différent doit être mis à jour pour les contrats actuels ; son échec ne doit pas être masqué en modifiant les contrats uniquement pour satisfaire une ancienne interface.

Un avertissement Vite concernant un bundle supérieur à 500 Ko ne signifie pas que la compilation a échoué. Vérifier la présence du message final de réussite.

## 13. Résoudre les problèmes fréquents

| Message ou symptôme | Vérification et action |
| --- | --- |
| Port 5173 déjà utilisé | Retrouver le terminal Vite existant. Le réutiliser ou l’arrêter avec Ctrl+C avant de relancer. |
| `Failed to fetch` à la publication | Ouvrir `/api/health`, vérifier le backend, `VITE_API_URL`, l’origine exacte du frontend et CORS. |
| `/api/health` fonctionne mais l’envoi échoue | Lire le message du formulaire et les terminaux ; vérifier les permissions Pinata et la console réseau du navigateur. |
| MetaMask ne se connecte pas à Hardhat | Vérifier que le nœud tourne et que le RPC est correct. |
| Contrats introuvables | Déployer sur le nœud actif et vérifier que `deployment.json` correspond à ce réseau. |
| Aucune campagne | Vérifier le réseau ; un nœud redémarré repart sans campagnes. |
| Image ou description indisponible | Vérifier le JSON IPFS, la passerelle et la référence enregistrée dans la campagne. |
| Compte avec zéro ETH | Utiliser un compte du nœud Hardhat sur le réseau 31337. |
| Nouveau `.env` sans effet | Redémarrer le service concerné. |
| Import introuvable | Vérifier le nom et la casse du fichier, notamment avant un déploiement Linux. |

Éviter de fermer le nœud Hardhat pour corriger un simple problème frontend : cela réinitialiserait la blockchain locale.

## 14. État fonctionnel à connaître

Le frontend décrit ici comprend l’accueil, la connexion partagée, l’état de la plateforme, la création des projets, leur liste, leur fiche, la contribution et la gouvernance existante.

La connexion partagée ne constitue pas à elle seule un tableau de bord personnel. L’affichage automatique « Mes projets / Mes contributions / Mes CFD », le formulaire de transfert des tokens et une interface complète de remboursement/retrait restent à intégrer si ces développements ne sont pas encore présents dans la version du dépôt récupérée.

La présence des fonctions dans un contrat ne signifie pas que tous leurs écrans existent déjà. Les CFD ne sont pas automatiquement détruits après un retrait réussi dans le contrat présenté. Le remboursement en cas d’échec ou d’annulation est une opération distincte.

## 15. Partager ses modifications sur GitHub

Ne jamais publier `.env`, les clés privées, les JWT, `node_modules` ou une archive de travail contenant ces éléments.

Vérifier que le `.gitignore` couvre les configurations privées et les dépendances. Exemples de règles :

```gitignore
node_modules/
.env
.env.*
!.env.example
dist/
artifacts/
cache/
*.zip
```

Ces règles peuvent être ajoutées aux règles existantes. Elles ne retirent pas un secret déjà suivi par Git. Un secret déjà publié doit être révoqué et remplacé.

Depuis la racine, vérifier puis ajouter les fichiers de l’interface :

```powershell
git branch --show-current
git status --short
git add frontend/src frontend/public frontend/index.html frontend/package.json frontend/package-lock.json README-demarrage.md
```

Si `.gitignore` ou les exemples de configuration ont été modifiés, les ajouter explicitement après vérification. Ajouter également tout fichier de configuration frontend réellement modifié et nécessaire au lancement.

Contrôler ce qui sera envoyé :

```powershell
git diff --cached --stat
git diff --cached
git ls-files -- .env backend/.env frontend/.env frontend/.env.local
```

La dernière commande ne doit afficher aucun fichier privé. Dans l’affichage paginé de `git diff`, appuyer sur `q` pour quitter.

Puis créer le commit et pousser la branche courante :

```powershell
git commit -m "Ajoute les parcours Tiwizi, la création IPFS et les fiches projets"
git push
```

Si le push est refusé parce que la branche distante a avancé, ne pas forcer : récupérer et intégrer les changements de l’équipe avant de pousser à nouveau.
