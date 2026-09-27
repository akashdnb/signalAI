import { config } from "../config.js";

export type PlanTier = "trial" | "starter" | "growth";

export interface PlanTierDefinition {
  tier: PlanTier;
  label: string;
  /** null for 'trial' — a trial has no Stripe price, it's not a Checkout target. */
  stripePriceIdGetter: (() => string) | null;
  dmsPerMonth: number;
  connectedAccounts: number;
  campaigns: number;
  /** Included token allowance per billing cycle (paid tiers) or per whole trial (trial). Overage beyond this is the pass-through metered line — see lib/overage.ts. */
  tokenAllowance: number;
}

/**
 * Phase 2B Plan Tiers. Hardcoded, not a DB table — there's no admin
 * surface for defining tiers at pilot scale, and a half-built
 * tier-management UI nothing edits yet is worse than an honest,
 * version-controlled config. Quotas on DMs/connected accounts/campaigns/
 * tokens — never on stored contacts, per the roadmap's own Non-Goals: a
 * viral Reel's leads sitting in the database cost the tenant nothing.
 */
export const PLAN_TIERS: Record<PlanTier, PlanTierDefinition> = {
  trial: {
    tier: "trial",
    label: "Trial",
    stripePriceIdGetter: null,
    dmsPerMonth: 200,
    connectedAccounts: 1,
    campaigns: 3,
    tokenAllowance: 200_000, // overridden at read time by config.trialTokenAllowance — see getPlanTier()
  },
  starter: {
    tier: "starter",
    label: "Starter",
    stripePriceIdGetter: () => config.stripeStarterPriceId,
    dmsPerMonth: 1000,
    connectedAccounts: 1,
    campaigns: 10,
    tokenAllowance: 1_000_000,
  },
  growth: {
    tier: "growth",
    label: "Growth",
    stripePriceIdGetter: () => config.stripeGrowthPriceId,
    dmsPerMonth: 5000,
    connectedAccounts: 3,
    campaigns: 50,
    tokenAllowance: 5_000_000,
  },
};

/** Trial's tokenAllowance is read from config (trialTokenAllowance), not the static table above, so an operator can tune it via env var without a code change — same reasoning as trialDays. */
export function getPlanTier(tier: PlanTier): PlanTierDefinition {
  const def = PLAN_TIERS[tier];
  if (tier === "trial") return { ...def, tokenAllowance: config.trialTokenAllowance };
  return def;
}

/** Resolves a Stripe price id back to the tier it belongs to — used by the checkout route to validate a requested tier is actually configured. */
export function resolvePriceIdForTier(tier: PlanTier): string | null {
  const def = getPlanTier(tier);
  if (!def.stripePriceIdGetter) return null;
  const priceId = def.stripePriceIdGetter();
  return priceId || null;
}
