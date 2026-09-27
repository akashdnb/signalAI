/**
 * Phase 2B Overage Pricing Bands. This is a LOCAL ESTIMATE for the Usage
 * Visibility Dashboard ("consumption is visible before an invoice, not
 * after") — not the authoritative billing calculation. Stripe's own
 * tiered/graduated pricing, configured on the metered price the daily
 * rollup reports usage to, is what actually determines the invoice once
 * usage lands there. Reimplementing Stripe's pricing engine here would be
 * two sources of truth that can drift; this exists only so a tenant sees
 * an approximate number before the invoice arrives, not after.
 */
export interface OverageBand {
  /** Tokens beyond the tier's included allowance, in this band. */
  upToTokens: number | null; // null = unbounded (the last band)
  pricePerThousandTokens: number; // USD
}

// Deliberately conservative/simple: two bands, no volume discount beyond
// the first million overage tokens. Tune via these constants, not a DB
// table — same "no admin surface at pilot scale" reasoning as PLAN_TIERS.
export const OVERAGE_BANDS: OverageBand[] = [
  { upToTokens: 1_000_000, pricePerThousandTokens: 0.002 },
  { upToTokens: null, pricePerThousandTokens: 0.0015 },
];

/** Returns the estimated USD cost of `overageTokens` tokens beyond a tier's included allowance, priced band by band. */
export function estimateOverageCost(overageTokens: number): number {
  if (overageTokens <= 0) return 0;

  let remaining = overageTokens;
  let cost = 0;
  let bandFloor = 0;

  for (const band of OVERAGE_BANDS) {
    const bandCeiling = band.upToTokens ?? Infinity;
    const bandCapacity = bandCeiling - bandFloor;
    const tokensInBand = Math.min(remaining, bandCapacity);
    cost += (tokensInBand / 1000) * band.pricePerThousandTokens;
    remaining -= tokensInBand;
    bandFloor = bandCeiling;
    if (remaining <= 0) break;
  }

  return Math.round(cost * 100) / 100;
}
