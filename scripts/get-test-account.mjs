
import { HDNodeWallet } from "ethers";

// Phrase publique utilisée par les comptes de test Hardhat.
const mnemonic =
  "test test test test test test test test test test test junk";

// Index 1 = deuxième compte Hardhat.
const wallet = HDNodeWallet.fromPhrase(
  mnemonic,
  undefined,
  "m/44'/60'/0'/0/1"
);

console.log("Adresse :", wallet.address);
console.log("Cle privee de TEST :", wallet.privateKey);
