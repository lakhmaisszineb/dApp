import { formatEther, parseEther } from "ethers";

const PLATFORM_FEE_BPS = 300n;
const BPS_DENOMINATOR = 10_000n;

function parseGoal(value) {
  const text = String(value ?? "").trim();

  if (!/^\d+(\.\d{1,18})?$/.test(text)) {
    return null;
  }

  try {
    const amount = parseEther(text);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

export default function CampaignFeePreview({ goal }) {
  const gross = parseGoal(goal);

  if (gross === null) {
    return (
      <p className="campaign-fee-preview">
        Saisis un objectif en ETH pour voir la commission et le montant net.
      </p>
    );
  }

  const fee = (gross * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
  const net = gross - fee;

  return (
    <aside className="campaign-fee-preview" aria-label="Aperçu financier">
      <h3>Aperçu financier de la campagne</h3>

      <dl>
        <dt>Objectif brut</dt>
        <dd>{formatEther(gross)} ETH</dd>

        <dt>Commission de plateforme au retrait (3 %)</dt>
        <dd>{formatEther(fee)} ETH</dd>

        <dt>Montant net estimé pour le bénéficiaire</dt>
        <dd>
          <strong>{formatEther(net)} ETH</strong>
        </dd>
      </dl>

      <p>
        Cet aperçu suppose que le montant retiré est égal à l’objectif.
        La commission réelle est calculée sur le montant retiré.
        Les frais réseau sont distincts.
      </p>
    </aside>
  );
}