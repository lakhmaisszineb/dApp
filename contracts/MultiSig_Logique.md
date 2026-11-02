# La Logique du Contrat MultiSig

## L'Histoire du Coffre-Fort à Trois Clés

Imaginez que le village de **Crowdfunding** ait une **trésorerie** : les frais de plateforme (3% sur les retraits réussis). Cet argent doit être protégé. Que se passe-t-il si une seule personne peut le retirer ? Elle pourrait le détourner. Que se passe-t-il si elle est compromise ? Tout l'argent est perdu.

La solution : un **coffre-fort à trois clés**. Trois personnes de confiance (les **signataires**) détiennent chacune une clé. Pour ouvrir le coffre, il faut **deux clés sur trois**. C'est le contrat **MultiSig**.

Voici comment ce coffre-fort fonctionne.

---

## Les Acteurs

### Les Signataires
Ce sont **trois personnes de confiance**. Elles forment le conseil de surveillance de la trésorerie. Elles sont désignées au déploiement du contrat. Elles ne peuvent pas être changées (c'est fixe).

**Qui sont-elles ?** C'est l'équipe qui décide. Par exemple :
*   Le créateur de la plateforme.
*   Un auditeur externe.
*   Un représentant des utilisateurs.

### Le Contrat Crowdfunding
C'est le **partenaire** de MultiSig. Il envoie les frais à MultiSig (via `withdrawFees`). Il reçoit les approbations de MultiSig (via `approveWithdrawalMultiSig`).

### Le Contrat Governance
C'est le **décideur** pour les campagnes. Il vote pour autoriser un retrait. Mais pour les gros montants, MultiSig doit aussi approuver.

---

## Le Cycle de Vie d'une Transaction

### 1. La Soumission
Un signataire soumet une transaction. C'est une demande d'action :
*   Envoyer de l'ETH à une adresse.
*   Appeler une fonction sur un autre contrat (ex: `approveWithdrawalMultiSig` sur Crowdfunding).

**Qui peut soumettre ?** N'importe quel signataire.

### 2. La Confirmation
Les autres signataires confirment la transaction. Chaque confirmation est enregistrée. Un signataire ne peut confirmer qu'une seule fois.

**Combien de confirmations ?** Il en faut **2 sur 3**.

### 3. L'Exécution
Une fois que 2 signataires ont confirmé, n'importe quel signataire peut exécuter la transaction. Le contrat envoie l'ETH et/ou appelle la fonction.

**Pourquoi n'importe quel signataire ?** Parce que l'exécution est mécanique. Une fois que la décision est prise (2/3), le contrat n'a qu'à appliquer la règle.

---

## Les Deux Rôles de MultiSig

### Rôle 1 : Gardien de la Trésorerie
MultiSig reçoit les **frais de plateforme** (3% sur les retraits réussis). Ces frais sont stockés dans le contrat.

**Pour les sortir**, il faut 2 signatures sur 3. C'est la protection ultime.

### Rôle 2 : Approbateur des Gros Retraits
Quand un bénéficiaire veut retirer un montant **supérieur à 0,5 ETH** (le seuil), il faut l'accord du multisig.

**Comment ?**
1.  Un signataire soumet une transaction : `approveWithdrawalMultiSig(campaignId)` sur Crowdfunding.
2.  Un autre signataire confirme.
3.  La transaction est exécutée.
4.  Crowdfunding marque `multisigApproved = true`.
5.  Le bénéficiaire peut retirer.

**Pourquoi ce double contrôle ?**
*   La **gouvernance** vote pour autoriser le retrait (décision communautaire).
*   Le **multisig** approuve pour les gros montants (sécurité supplémentaire).
*   Ce sont **deux mécanismes différents** qui se complètent.

---

## Les Décisions de Conception

### Pourquoi 3 signataires ?
Le professeur impose **2-sur-3 minimum**. Trois est le minimum pour avoir un consensus significatif. Avec 2 signataires, il faudrait 2/2 (unanimité), ce qui est trop rigide. Avec 3, on peut avoir 2/3 (majorité qualifiée).

### Pourquoi 2 sur 3 ?
C'est un équilibre entre sécurité et efficacité. Il faut un consensus, mais pas l'unanimité. Si un signataire est indisponible, les deux autres peuvent agir.

### Pourquoi les signataires sont-ils fixes ?
Parce que c'est plus simple et plus sûr. Si on pouvait changer les signataires, on pourrait les remplacer par des adresses malveillantes. Le professeur ne demande pas de mécanisme de remplacement. On garde ça simple.

### Pourquoi n'importe qui peut exécuter une transaction ?
Parce que l'exécution est **mécanique**. Une fois que 2/3 ont confirmé, la décision est prise. N'importe qui peut appuyer sur le bouton. C'est la décentralisation.

### Pourquoi le multisig ne peut-il pas être contourné ?
Parce que `Crowdfunding` vérifie `msg.sender == multiSig` dans `approveWithdrawalMultiSig`. Seul le contrat MultiSig peut appeler cette fonction. Personne d'autre.

---

## Le Circuit de l'Argent

### Les Frais de Plateforme
1.  Lors d'un retrait réussi, `Crowdfunding` prélève 3% de frais.
2.  Ces frais sont stockés dans `accruedFees`.
3.  N'importe qui peut appeler `withdrawFees()` pour envoyer `accruedFees` à MultiSig.
4.  MultiSig reçoit l'ETH (via `receive()`).
5.  Pour sortir l'argent de MultiSig, il faut 2 signatures sur 3.

### Les Gros Retraits
1.  Le bénéficiaire demande un retrait (`requestWithdrawal`).
2.  La gouvernance vote (`authorizeWithdrawal`).
3.  Si le montant > 0,5 ETH, MultiSig doit approuver (`approveWithdrawalMultiSig`).
4.  Le bénéficiaire peut retirer (`withdrawFunds`).

---

## En Résumé

Le **MultiSig** est un coffre-fort à trois clés où :
*   Les **signataires** protègent la trésorerie.
*   Il faut **2 signatures sur 3** pour agir.
*   Les **frais de plateforme** sont stockés ici.
*   Les **gros retraits** sont approuvés ici.

Tout est transparent, tout est vérifiable, et personne ne peut détourner l'argent. C'est la promesse de la blockchain : **remplacer la confiance envers une personne par la confiance envers du code**.

---

*Document rédigé par l'équipe projet. Pour toute question, se référer au contrat `MultiSig.sol`.*