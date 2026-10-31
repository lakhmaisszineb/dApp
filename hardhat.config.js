// hardhat.config.js — configuration Hardhat 3 
import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "dotenv/config"; // charge .env (jamais commité) -> process.env

export default defineConfig({
  // Toolbox : Ethers v6 + Mocha/Chai + network-helpers + Ignition + typechain + verify + keystore
  plugins: [hardhatToolboxMochaEthers],

  solidity: {
    version: "0.8.28", // exigence du sujet : Solidity ^0.8.x. Version FIGÉE (pas de ^) pour des builds reproductibles
    settings: {
      optimizer: { enabled: true, runs: 200 }, // valeur standard : compromis taille/gas
    },
  },

  networks: {
    // Réseau en mémoire (tests) : "hardhat" 
    // Nœud local persistant le temps d'une session : `npx hardhat node` puis --network localhost
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545" },
    // Testnet exigé Sepolia 
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },

  test: { mocha: { timeout: 60_000 } },
});
