import { formatEther } from "ethers";

export async function sendWithFeePreview({
  signer,
  method,
  args,
  label,
  value = 0n,
}) {
  const provider = signer.provider;

  if (!provider) {
    throw new Error("Impossible de lire les frais du réseau.");
  }

  const callArgs = value > 0n ? [...args, { value }] : args;

  const [gasEstimate, feeData] = await Promise.all([
    method.estimateGas(...callArgs),
    provider.getFeeData(),
  ]);

  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;

  if (gasPrice == null) {
    throw new Error("Le réseau n’a pas fourni de prix du gas.");
  }

  const estimatedFee = gasEstimate * gasPrice;
  const feeLabel =
    feeData.maxFeePerGas != null
      ? "Budget gas indicatif au prix plafond"
      : "Frais réseau estimés";

  const lines = [
    label,
    `Compte : ${await signer.getAddress()}`,
    `Gas estimé : ${gasEstimate.toString()} unités`,
    `${feeLabel} : ${formatEther(estimatedFee)} ETH`,
  ];

  if (value > 0n) {
    lines.push(
      `Montant envoyé : ${formatEther(value)} ETH`,
      `Total indicatif avec le gas : ${formatEther(value + estimatedFee)} ETH`
    );
  }

  lines.push(
    "",
    "Les frais définitifs sont affichés après confirmation sur le réseau.",
    "Continuer vers MetaMask ?"
  );

  if (!window.confirm(lines.join("\n"))) {
    throw new Error("Transaction annulée avant l’envoi.");
  }

  return method(...callArgs);
}