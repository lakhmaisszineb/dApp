# La Logique du Contrat Crowdfunding

## L'Histoire de la Plateforme

Imaginez un village où les habitants veulent financer des projets : une école, un puits, une place de marché. Mais personne ne fait confiance à un trésorier unique. Que se passe-t-il si le trésorier s'enfuit avec l'argent ? Que se passe-t-il si le projet échoue et que personne n'est remboursé ?

La plateforme **Crowdfunding** résout ce problème. Elle remplace le trésorier par un **contrat intelligent** : un programme qui vit sur la blockchain et qui exécute les règles à la lettre, sans intervention humaine. Personne ne peut tricher, ni le créateur, ni le bénéficiaire, ni même l'administrateur.

Voici comment ce village fonctionne.

---

## Les Acteurs

### Le Créateur
C'est la personne qui a une idée. Elle crée une campagne : "Je veux construire une école, j'ai besoin de 10 ETH, et j'ai 30 jours pour les collecter."

### Le Bénéficiaire
C'est la personne (ou l'organisation) qui recevra les fonds si la campagne réussit. Le créateur et le bénéficiaire peuvent être la même personne, ou non. Par exemple, un habitant peut créer une campagne pour financer une école, mais c'est l'association locale qui recevra les fonds.

### Le Contributeur
C'est un habitant qui croit au projet. Il donne de l'argent (de l'ETH) à la campagne. En retour, il reçoit des **jetons CFD** (des "parts de confiance"). Ces jetons lui donnent deux droits :
1. Le droit de voter sur les décisions importantes de la campagne.
2. Le droit d'être remboursé si la campagne échoue.

### L'Administrateur
C'est le gardien de la plateforme. Il a un pouvoir limité : il peut mettre la plateforme en pause en cas d'urgence (comme un disjoncteur). Mais il ne peut **jamais** décider du déblocage des fonds, ni annuler une campagne. Ce pouvoir appartient aux contributeurs.

### Les Signataires (Multisig)
Ce sont trois personnes de confiance. Elles forment un **multisig** (un coffre-fort à trois clés). Pour les gros retraits, il faut l'accord de **deux personnes sur trois**. Cela évite qu'une seule personne malveillante ou compromise puisse vider la trésorerie.

---

## Les Contrats Externes

`Crowdfunding` n'est pas seul. Il s'appuie sur deux autres contrats :

*   **`Governance.sol`** : Gère les propositions, les votes, le quorum, la majorité, et le snapshot. C'est lui qui appelle `authorizeWithdrawal`, `setFrozen`, et `cancelCampaign` quand un vote est validé.
*   **`MultiSig.sol`** : Gère les 3 signataires. C'est lui qui appelle `approveWithdrawalMultiSig` quand 2/3 ont approuvé. C'est aussi lui qui gère la trésorerie de la plateforme.

`Crowdfunding` ne fait qu'**enregistrer** les décisions de `Governance` et `MultiSig`. Il ne décide pas à leur place.

---

## Le Cycle de Vie d'une Campagne

### 1. La Création
Le créateur décrit son projet : objectif, durée, bénéficiaire, et une description stockée sur IPFS. Il crée la campagne. À cet instant, un **jeton CFD unique** est créé pour cette campagne. Les CFD de la campagne "École" ne donnent aucun droit de vote dans la campagne "Puits". C'est une séparation stricte.

### 2. La Contribution
Les habitants donnent de l'ETH. Pour chaque ETH donné, ils reçoivent automatiquement des CFD. Plus ils donnent, plus ils ont de pouvoir de vote. L'argent est stocké dans le contrat, pas chez une banque.

**Décision de conception :** Les contributions sont possibles **jusqu'à la date limite**. Après, c'est fini. On ne peut plus donner.

### 3. La Finalisation
À la date limite, le destin de la campagne est scellé :
* Si le total collecté **atteint ou dépasse** l'objectif : la campagne est **réussie**.
* Sinon : la campagne est **échouée**.

**Décision de conception :** La finalisation est **paresseuse** (lazy). Personne n'est obligé de cliquer sur un bouton à minuit. Le premier qui a besoin de connaître le statut (pour rembourser ou pour retirer) déclenche la finalisation. C'est plus simple et moins cher.

**Blocage théorique :** Si personne ne déclenche la finalisation, la campagne reste `Active`. Mais `contribute` vérifie la deadline, donc on ne peut pas contribuer après. Le premier qui a besoin d'agir (remboursement, retrait) déclenche la finalisation. Le blocage est donc théorique.

### 4. Le Remboursement (si la campagne échoue)
Si la campagne échoue, les contributeurs peuvent récupérer leur argent. Pour chaque CFD qu'ils possèdent, ils sont remboursés en ETH. Ensuite, leurs CFD sont **brûlés** (détruits). Ils ne peuvent pas être remboursés deux fois.

**Décision de conception :** Le remboursement suit le **porteur actuel** des CFD, pas le contributeur initial. Si Alice a donné puis vendu ses CFD à Bob, c'est Bob qui est remboursé. C'est plus juste et plus simple.

### 5. Le Retrait (si la campagne réussit)
Si la campagne réussit, le bénéficiaire veut retirer l'argent. Mais ce n'est pas automatique. Il doit suivre un parcours en **cinq étapes** :

#### Étape 1 : La Demande de Retrait
Le bénéficiaire demande à retirer les fonds. À cet instant, le contrat **fige** les montants : le montant brut, les frais de plateforme (3%), et le montant net. Ces chiffres ne changeront plus. Pourquoi ? Pour que tout le monde (bénéficiaire, votants, signataires) voie exactement les mêmes chiffres avant de voter.

**Cas particulier :** Si le bénéficiaire veut retirer **avant la date limite** (parce que l'objectif est déjà atteint), il peut le faire. Mais cela **ferme immédiatement la collecte**. Plus personne ne peut contribuer. C'est pour éviter que le montant ne change pendant le vote.

#### Étape 2 : Le Vote de la Gouvernance
Les détenteurs de CFD votent. Pour ou contre le retrait. C'est la **décision communautaire**. Si la majorité (avec un quorum) vote pour, la gouvernance appelle la fonction d'autorisation.

**Décision de conception :** Le vote est **pondéré par les CFD**. Plus tu as contribué, plus ton vote compte. C'est la démocratie proportionnelle à l'investissement.

#### Étape 3 : L'Approbation du Multisig (si le montant est gros)
Si le montant brut dépasse **0,5 ETH**, il faut l'accord de **2 signataires sur 3**. C'est une sécurité supplémentaire pour les gros montants. Pour les petits montants, le vote de la gouvernance suffit.

**Décision de conception :** Le seuil est fixé à 0,5 ETH. Il peut être modifié avant le déploiement.

#### Étape 4 : Le Paiement
Une fois les autorisations obtenues, le bénéficiaire peut retirer. Le contrat lui envoie le **montant net** (brut moins les frais). Les frais (3%) sont mis de côté dans une réserve.

**Décision de conception :** Les frais ne sont **jamais** prélevés sur une campagne échouée. Si la campagne échoue, le remboursement rend **l'intégralité** des ETH. Les frais ne sont prélevés que sur les campagnes réussies.

**Revérification :** `withdrawFunds` revérifie **tout** au moment du paiement : gel, pause, autorisations. Un gel ou une annulation **après** le vote peut bloquer le paiement. C'est une protection contre les changements de dernière minute.

#### Étape 5 : Le Transfert des Frais
La réserve de frais est envoyée au multisig. C'est la **trésorerie de la plateforme**. Pour en sortir, il faudra 2 signatures sur 3. C'est la protection ultime.

**Décision de conception :** N'importe qui peut déclencher le transfert des frais vers le multisig. L'argent va **toujours** au multisig. Personne ne peut le détourner.

---

## Le Gel et l'Annulation

### Le Gel
Une campagne peut être **gelée** par la gouvernance (via un vote). Le gel est **temporaire** : on peut dégeler.
*   **Ce qui est bloqué :** Les contributions et les retraits.
*   **Ce qui n'est pas bloqué :** Les remboursements (rendre l'argent ne met personne en danger).
*   **Qui décide ?** La gouvernance, via un vote.

### L'Annulation
Une campagne peut être **annulée** par la gouvernance (via un vote). L'annulation est **définitive**.
*   **Ce qui se passe :** Le statut passe à `Cancelled`. Les contributeurs peuvent se faire rembourser.
*   **Qui décide ?** La gouvernance, via un vote.
*   **Quand ?** Uniquement si la campagne est encore `Active`. On ne peut pas annuler une campagne déjà finalisée.

---

## Les Frais de Plateforme

La plateforme prélève **3%** sur les retraits réussis. Ces frais servent à financer le fonctionnement de la plateforme (hébergement, maintenance, développement).

**Circuit de l'argent :**
1.  Lors d'un retrait, 3% du montant brut sont mis de côté dans `accruedFees`.
2.  N'importe qui peut appeler `withdrawFees` pour envoyer `accruedFees` au multisig.
3.  Le multisig accumule les frais.
4.  Pour sortir l'argent du multisig, il faut 2 signatures sur 3.

**Décision de conception :** Les frais ne sont **jamais** prélevés sur une campagne échouée. Le remboursement rend l'intégralité des ETH.

---

## La Pause d'Urgence

L'administrateur peut **mettre en pause** tout le contrat (`pause`/`unpause`). C'est un **circuit breaker**.
*   **Ce qui est bloqué :** Toutes les opérations (contributions, retraits, remboursements).
*   **Pourquoi ?** En cas d'urgence (faille détectée, activité suspecte).
*   **Qui décide ?** L'administrateur.

**Décision de conception :** La pause est un pouvoir **limité** et **temporaire**. L'admin ne peut pas l'utiliser pour décider du déblocage des fonds. Il ne peut que geler temporairement.

---

## Les Décisions de Conception

### Pourquoi un jeton par campagne ?
Chaque campagne a son propre contrat de jeton. Cela garantit une **séparation parfaite** des votes. Les CFD de la campagne "École" ne donnent aucun droit de vote dans la campagne "Puits". C'est plus cher en gaz (déploiement), mais c'est plus simple et plus sûr.

### Les CFD sont-ils transférables ?
Techniquement, oui. Les CFD sont un ERC-20 standard, donc ils peuvent être transférés. Cependant, le remboursement suit le **porteur actuel** des CFD, pas le contributeur initial. Cela décourage les transferts malveillants : si vous vendez vos CFD, vous perdez le droit au remboursement. C'est une incitation à conserver ses CFD.

### Pourquoi le gel n'empêche-t-il pas le remboursement ?
Si une campagne est gelée (parce qu'elle est suspecte), les contributions sont bloquées, les retraits sont bloqués. Mais les **remboursements restent possibles**. Pourquoi ? Parce que rendre l'argent aux contributeurs ne met personne en danger. C'est une mesure de protection des utilisateurs.

### Pourquoi la finalisation est-elle paresseuse ?
Le temps ne déclenche pas de transaction tout seul sur la blockchain. Personne ne peut "programmer" une action à une date précise. La finalisation est donc **paresseuse** : c'est le premier qui a besoin de connaître le statut qui la déclenche. C'est plus simple et moins cher.

### Pourquoi l'administrateur ne peut-il pas changer la gouvernance ?
L'administrateur peut définir l'adresse de la gouvernance **une seule fois**. Après, c'est figé. Pourquoi ? Parce que si l'administrateur pouvait changer la gouvernance à tout moment, il pourrait la remplacer par sa propre adresse et prendre le contrôle de toutes les décisions. C'est une protection contre la centralisation.

---

## En Résumé

La plateforme **Crowdfunding** est un village numérique où :
* Les **créateurs** proposent des projets.
* Les **contributeurs** financent et reçoivent des CFD.
* Les **détenteurs de CFD** votent sur les décisions importantes.
* Les **signataires** protègent les gros montants.
* L'**administrateur** peut mettre en pause en cas d'urgence, mais ne décide jamais du déblocage.

Tout est transparent, tout est vérifiable, et personne ne peut tricher. C'est la promesse de la blockchain : **remplacer la confiance envers une personne par la confiance envers du code**.

---

*Document rédigé par l'équipe projet. Pour toute question, se référer au contrat `Crowdfunding.sol`.*