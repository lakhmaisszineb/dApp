# Backend IPFS du projet Crowdfunding

## Utilité

Ce backend reçoit les informations de présentation d'une campagne,
stocke son image et ses métadonnées sur IPFS via Pinata, puis retourne
leurs références.

Le frontend utilise ensuite `metadataURI` comme paramètre `ipfsHash`
lors de l'appel à `Crowdfunding.createCampaign`.

Le backend ne signe pas de transaction blockchain et ne possède pas
la clé privée du créateur.

## Prérequis

- Node.js 24, utilisé pour notre développement.
- Un compte Pinata.
- Un JWT autorisant l'envoi de fichiers publics.
- Le domaine de la passerelle Pinata.

## Installation

Depuis le dossier `backend` :

```powershell
npm ci
```

Créer la configuration locale si elle n'existe pas :

```powershell
Copy-Item ".env.example" ".env"
```

Compléter `.env` avec son JWT et son domaine Pinata.

Ne jamais publier `.env` ni placer le JWT dans le frontend.

## Démarrage

Développement avec redémarrage automatique :

```powershell
npm run dev
```

Démarrage simple :

```powershell
npm start
```

Par défaut, le serveur écoute sur :

```text
http://127.0.0.1:3001
```

## Vérifier le serveur

```http
GET /api/health
```

Réponse :

```json
{
  "status": "ok",
  "service": "crowdfunding-ipfs-backend"
}
```

Cette route vérifie le serveur, pas la disponibilité de Pinata.

## Envoyer les métadonnées d'une campagne

```http
POST /api/campaign-metadata
Content-Type: multipart/form-data
```

Champs acceptés :

| Champ | Format et limites |
|---|---|
| title | Texte obligatoire, 120 caractères maximum |
| summary | Texte obligatoire, 300 caractères maximum |
| description | Texte obligatoire, 10 000 caractères maximum |
| category | Texte obligatoire, 80 caractères maximum |
| fundsUsage | Tableau encodé en JSON, entre 1 et 10 rubriques |
| image | Une image JPEG ou PNG, 5 Mo maximum |

Chaque rubrique de `fundsUsage` contient :

- `label` : texte obligatoire, 120 caractères maximum ;
- `description` : texte obligatoire, 1 000 caractères maximum.

Les champs texte supplémentaires sont refusés.

## Traitement de l'image

Le backend vérifie le format réel avec Sharp.

Il refuse les images dépassant la limite de pixels configurée
et les images comportant plusieurs pages.

L'image est réencodée en JPEG, avec une taille maximale de
1600 × 1600 pixels, sans agrandissement.

La transparence est remplacée par un fond blanc.
Les métadonnées d'origine ne sont pas conservées par défaut.

Ce choix limite le poids des images et uniformise leur affichage.

## Métadonnées produites

Le JSON enregistré sur IPFS contient :

- schemaVersion ;
- title ;
- summary ;
- description ;
- category ;
- image ;
- fundsUsage ;
- documents : tableau vide dans cette version ;
- links : tableau vide dans cette version.

L'objectif, l'échéance, le bénéficiaire, le montant collecté et le
statut sont lus depuis Crowdfunding, qui reste leur source de référence.

## Réponse de succès

Statut HTTP : 201.

```json
{
  "metadataCID": "<CID du JSON>",
  "metadataURI": "ipfs://<CID du JSON>",
  "metadataURL": "https://<passerelle>/ipfs/<CID du JSON>",
  "imageCID": "<CID de l'image>",
  "imageURI": "ipfs://<CID de l'image>",
  "imageURL": "https://<passerelle>/ipfs/<CID de l'image>"
}
```

Cette réponse confirme l'envoi IPFS, pas la création d'une campagne
sur la blockchain.

## Utilisation depuis le frontend

```javascript
const form = new FormData();

form.append("title", values.title);
form.append("summary", values.summary);
form.append("description", values.description);
form.append("category", values.category);
form.append("fundsUsage", JSON.stringify(values.fundsUsage));
form.append("image", imageFile);

const response = await fetch(
    "http://127.0.0.1:3001/api/campaign-metadata",
    {
        method: "POST",
        body: form
    }
);

const result = await response.json();

if (!response.ok) {
    throw new Error(result.error ?? "Échec de l'envoi");
}

// Après cela, le frontend appelle createCampaign avec
// result.metadataURI, via le portefeuille du créateur.
```

Ne pas définir manuellement Content-Type avec FormData :
le navigateur ajoute lui-même la séparation multipart.

L'origine du frontend doit correspondre à FRONTEND_ORIGIN.

## Erreurs possibles

| HTTP | Signification |
|---|---|
| 400 | Champs manquants, données invalides ou image refusée |
| 413 | Fichier ou champ trop volumineux |
| 429 | Limite de fréquence atteinte |
| 502 | Échec de l'envoi vers Pinata |
| 503 | Trop d'envois simultanés |

Les réponses d'erreur contiennent un champ `error`.

Si l'envoi du JSON échoue après celui de l'image, l'image peut déjà
exister sur Pinata. L'envoi des deux fichiers n'est pas atomique.

## Vérifications réalisées

- Envoi et lecture d'un JSON sur IPFS.
- Envoi et lecture d'une image et de ses métadonnées.
- Envoi dynamique via la route HTTP.
- Lecture des fichiers retournés via la passerelle.
- Création d'une campagne locale avec metadataURI.
- Vérification de la référence enregistrée dans Crowdfunding.

Script de vérification blockchain, depuis la racine du dépôt :

```powershell
npx hardhat run scripts/verify-ipfs-campaign.js
```

Ce script nécessite le fichier local
`backend/output/campaign-api-result.json`, généré par l'envoi de test.

Il crée un réseau simulé temporaire : son déploiement ne sert pas
au frontend.

## Limites de cette version

Le backend est configuré pour le développement local.

La limite est de 10 demandes par IP sur 15 minutes et de deux
traitements simultanés. Les compteurs sont locaux au processus.

Avant un déploiement public, il faut ajouter l'authentification des
envois et adapter les limites et la configuration réseau.

CORS ne remplace pas l'authentification.

Les fichiers envoyés sur IPFS public sont publics.
Leur disponibilité dépend notamment de leur conservation par pinning.