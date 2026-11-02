# La Logique du Contrat Governance

## L'Histoire de la Salle du Conseil

Imaginez que le village de **Crowdfunding** ait besoin de prendre des décisions importantes : autoriser le bénéficiaire à retirer l'argent, geler une campagne suspecte, ou annuler un projet frauduleux. Qui décide ? Pas un chef unique, pas un administrateur tout-puissant. **Les habitants eux-mêmes**, proportionnellement à leur contribution.

La **Salle du Conseil** (`Governance`) est le lieu où ces décisions sont prises. C'est un contrat intelligent qui organise des votes, compte les voix, et exécute la volonté collective. Personne ne peut tricher, ni le créateur, ni le bénéficiaire, ni même l'administrateur.

Voici comment cette salle du conseil fonctionne.

---

## Les Acteurs

### Le Proposeur
C'est la personne qui soumet une idée au vote. Elle peut être :
*   **Un détenteur de CFD** de la campagne concernée (pour geler, dégeler ou annuler).
*   **Le bénéficiaire** de la campagne (pour demander un retrait).

### Le Votant
C'est un **détenteur de CFD** de la campagne concernée. Son pouvoir de vote est proportionnel à sa contribution. Plus il a contribué, plus sa voix compte.

### L'Exécuteur
C'est **n'importe qui**. Une fois qu'une proposition est adoptée, n'importe qui peut déclencher son exécution. Le contrat applique la décision.

---

## Les Types de Propositions

La Salle du Conseil peut traiter **quatre types** de décisions :

1.  **Withdrawal (Retrait)** : Autoriser le bénéficiaire à retirer les fonds de la campagne.
2.  **Freeze (Gel)** : Geler une campagne suspecte (bloquer les contributions et les retraits).
3.  **Unfreeze (Dégel)** : Dégeler une campagne qui a été innocentée.
4.  **Cancel (Annulation)** : Annuler définitivement une campagne frauduleuse. Les contributeurs seront remboursés.

---

## Le Cycle de Vie d'une Proposition

### 1. La Création
Un proposeur soumet une proposition. À cet instant :
*   Le **snapshot** est pris : on enregistre le bloc actuel de la blockchain.
*   La **date limite** du vote est fixée à 3 jours.
*   Les compteurs de voix sont à zéro.

**Décision de conception :** Le snapshot fige le pouvoir de vote au moment de la création. Cela empêche une manipulation : quelqu'un ne peut pas acheter massivement des CFD juste avant le vote pour influencer le résultat. Son pouvoir de vote est celui qu'il avait **au moment de la création**.

### 2. Le Vote
Les détenteurs de CFD votent "pour" ou "contre". Chaque vote est pondéré par le **pouvoir de vote au snapshot**.

**Décision de conception :** Un utilisateur ne peut voter qu'**une seule fois**. Le contrat enregistre qui a voté (mapping `hasVoted`). C'est une protection contre le vote multiple.

### 3. La Clôture
À la date limite, le vote est clos. Le contrat calcule le résultat :
*   **Quorum** : Le total des votes (pour + contre) doit atteindre **20%** du total des CFD en circulation au snapshot. Sinon, la proposition est **rejetée**.
*   **Majorité** : Si le quorum est atteint, la proposition est **adoptée** si les votes "pour" sont supérieurs aux votes "contre". Sinon, elle est **rejetée**.

**Décision de conception :** Le quorum est fixé à 20%. C'est un choix de l'équipe. Il peut être modifié avant le déploiement. Le quorum évite qu'une minorité prenne des décisions pour tout le monde.

### 4. L'Exécution
Si la proposition est adoptée, n'importe qui peut l'exécuter. Le contrat `Governance` appelle alors la fonction correspondante de `Crowdfunding` :
*   `Withdrawal` → `authorizeWithdrawal(campaignId)`.
*   `Freeze` → `setFrozen(campaignId, true)`.
*   `Unfreeze` → `setFrozen(campaignId, false)`.
*   `Cancel` → `cancelCampaign(campaignId)`.

**Décision de conception :** L'exécution est **publique**. N'importe qui peut la déclencher. Cela évite qu'une seule personne doive le faire. C'est la décentralisation.

---

## Les Paramètres de Gouvernance

Tous les paramètres sont définis en **constantes** au début du contrat. Pour les modifier, il suffit de changer **une seule ligne**.

| Paramètre | Valeur actuelle | Rôle |
| :--- | :--- | :--- |
| **`QUORUM_BPS`** | 2000 (= 20%) | Pourcentage minimum de CFD qui doivent voter pour que le vote soit valide. |
| **`VOTING_PERIOD`** | 3 days | Durée du vote. |

**Note :** `BPS_DENOMINATOR` (10 000) ne se touche pas. C'est le dénominateur des points de base.

---

## Le Snapshot : Le Cœur de la Sécurité

Le snapshot est **la** protection contre la manipulation. Voici comment il fonctionne :

1.  Quand une proposition est créée, on enregistre `snapshotBlock = block.number`.
2.  Quand un utilisateur vote, on lit son pouvoir de vote **à ce bloc** via `getPastVotes(account, snapshotBlock)`.
3.  Si l'utilisateur a acheté des CFD **après** le snapshot, ces CFD ne comptent **pas** pour ce vote.

**Pourquoi c'est important ?**
*   Sans snapshot, un attaquant pourrait acheter massivement des CFD juste avant un vote, voter, puis revendre. C'est ce qu'on appelle une **attaque éclair** (flash loan attack).
*   Avec le snapshot, le pouvoir de vote est figé. L'attaquant ne peut pas manipuler le vote.

**Comment ça marche techniquement ?**
*   Le token CFD (`CFDToken.sol`) hérite de `ERC20Votes` (OpenZeppelin).
*   `ERC20Votes` conserve un historique des soldes à chaque bloc.
*   `getPastVotes(account, blockNumber)` retourne le pouvoir de vote à un bloc passé.

---

## Les Décisions de Conception

### Pourquoi un quorum de 20% ?
Un quorum trop bas permettrait à une minorité de prendre des décisions. Un quorum trop haut rendrait difficile l'adoption de propositions. 20% est un bon équilibre. C'est un choix de l'équipe, qui peut être modifié.

### Pourquoi une majorité simple (>50%) ?
La majorité simple est plus facile à atteindre. Pour des décisions critiques (comme l'annulation), on pourrait utiliser une majorité qualifiée (>66%). Mais pour commencer, la majorité simple est suffisante.

### Pourquoi une durée de vote de 3 jours ?
3 jours laisse le temps aux détenteurs de voter, sans bloquer le processus trop longtemps. C'est un choix de l'équipe.

### Pourquoi le bénéficiaire peut-il créer une proposition de retrait sans avoir de CFD ?
Parce que c'est **son argent**. Il a le droit de demander le retrait. Mais il ne peut pas voter (sauf s'il a contribué). C'est une séparation des pouvoirs : le bénéficiaire propose, les détenteurs décident.

### Pourquoi n'importe qui peut exécuter une proposition adoptée ?
Parce que l'exécution est **mécanique**. Une fois que la décision est prise, le contrat n'a qu'à appliquer la règle. N'importe qui peut appuyer sur le bouton. C'est la décentralisation.

---

## Ce qui se passe si le quorum n'est pas atteint

La proposition est **rejetée** (Defeated). Elle ne peut pas être exécutée. C'est une protection contre les décisions prises par une minorité.

**Exemple :**
*   Total des CFD : 1000.
*   Quorum : 20% = 200 CFD.
*   Votes "pour" : 100 CFD.
*   Votes "contre" : 50 CFD.
*   Total voté : 150 CFD < 200 CFD → **Quorum non atteint** → **Rejetée**.

---

## En Résumé

La **Salle du Conseil** (`Governance`) est un lieu où :
*   Les **détenteurs de CFD** votent sur les décisions importantes.
*   Le **pouvoir de vote** est proportionnel à la contribution et figé au moment du snapshot.
*   Le **quorum** et la **majorité** garantissent que les décisions sont légitimes.
*   L'**exécution** est publique et automatique.

Tout est transparent, tout est vérifiable, et personne ne peut tricher. C'est la promesse de la blockchain : **remplacer la confiance envers une personne par la confiance envers du code**.

---

*Document rédigé par l'équipe projet. Pour toute question, se référer au contrat `Governance.sol`.*