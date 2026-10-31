# Plateforme de financement participatif décentralisée à gouvernance par jeton (CFD)

Projet du module **Blockchain** — ENSA Béni Mellal, filière Intelligence Artificielle et Cybersécurité.
Ce README documente l'**environnement**  et **justifie chaque choix technique**.

## 1. Prérequis et installation

Installer l'extension solidiry depuis les extensions dans VScode.

| Outil | Version | Pourquoi | Verification
|---|---|---|
| Node.js | ≥ 22.10 (LTS) | Exigé par Hardhat 3 | node -v && npm -v |
| Python | ≥ 3.10 | Slither : pip install slither-analyzer | python --version |
| MetaMask | dernière | Portefeuille du navigateur pour la dApp | https://metamask.io/download/ |

```bash
git clone <url-du-depot> 
npm install                       # dépendances JS 
cp .env.example .env              # puis remplir SEULEMENT ce dont vous avez besoin 
python -m venv .venv && source .venv/bin/activate      # Windows : .venv\Scripts\activate
pip install -r requirements.txt   # Slither + outils Python
solc-select install 0.8.28 && solc-select use 0.8.28  # même compilateur que Hardhat, pour Slither

npm test                          # doit afficher 4 tests au vert 
```

Commandes utiles : `npm run build` (compiler), `npm test`, `npm run coverage`, `npm run node` (nœud local persistant le temps d'une session), `npm run slither -- contracts/MonContrat.sol`.

## 2. Choix technologiques justifiés

| Choix | Alternative écartée | Justification |
|---|---|---|
| **Hardhat 3**  | Foundry, | Hardhat = tests en **JavaScript** avec Ethers.js, donc la **même bibliothèque que le front-end** (Ethers v6) : les scénarios de test se réutilisent presque tels quels dans la dApp. Hardhat 3 intègre en natif la **couverture** (`--coverage`) et des **tests Solidity avec fuzzing** (`fuzz` dans la config). |
| **Solidity 0.8.28** | `^0.8.x` |  Version **exacte** dans la config pour compiler avec le même compilateur. Les contrats portent `pragma solidity ^0.8.28;`. |
| **OpenZeppelin Contracts 5.6.1** | Code écrit à la main | Bibliothèque imposée et auditée. `ERC20`, `AccessControl`, `ReentrancyGuard`, `Pausable`, plus **`ERC20Votes`**.  |
| **`ERC20Votes` pour le jeton CFD** | mapping de soldes |  `ERC20Votes` enregistre des *checkpoints* par bloc et expose `getPastVotes(compte, bloc)`. |
| **Optimiseur activé (200 runs)** | Sans optimiseur | Valeur par défaut recommandée : compromis entre taille du bytecode et coût du gaz à l'usage. |
| **Ethers.js v6** | Web3.js | Imposé « Ethers.js ou Web3.js » ; v6 est la version maintenue, utilisée par Hardhat 3 et par le front. |
| **Mocha + Chai** | Tests Solidity uniquement | Syntaxe lisible pour des scénarios métier ; les tests Solidity (Hardhat 3) serviront pour le **fuzzing**. |

## 3. Structure du dépôt 

```
dApp/
├── contracts/            # Solidity : CFDToken, Crowdfunding, Governance, Treasury 
│   ├── interfaces/       
│   └── mocks/            #   contrats de test
├── test/                 # tests unitaires, reentrance, scénario complet, fuzzing
├── frontend/             # dApp (React + Ethers.js + MetaMask) + .env.example propre au front
├── scripts/              # déploiement, export ABI/adresses, upload IPFS, script Python bonus
├── docs/                 # rapport, schéma d'architecture, rapport d'audit, captures
├── hardhat.config.js     # compilateur, optimiseur, réseaux (commenté)
├── package.json          # dépendances JS verrouillées + scripts npm
├── requirements.txt      # dépendances Python 
├── .env.example          # modèle des variables d'environnement
└── .gitignore            # exclut .env, node_modules, artifacts, venv…
```

