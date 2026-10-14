import type { Pool } from "pg";
import type { Tenant } from "../db/tenants.js";
import { getTokenUsageSince } from "../db/tokenUsage.js";
import { getPlanTier } from "../lib/planTiers.js";
import type { AiSpendGuard } from "./aiSpendGuard.js";
import { resolveEffectiveBilling, billingCycleStart } from "./billingResolver.js";

/**
 * Agency Bulk Billing: composes a token-allowance ceiling onto the per-account
 * daily-call spend guard, choosing the ceiling from the workspace's EFFECTIVE
 * billing (resolver) rather than tenant.plan_tier directly.
 *
 * - Plan-covered workspace with a per-workspace cap: reject once the workspace
 *   spends its cap in the current cycle, while other covered workspaces keep
 *   running (ElevenLabs-style per-workspace limit). No cap = draw freely from
 *   the shared pool (only the base daily-call guard applies).
 * - Own-billing trial workspace: the pre-existing cumulative trial token
 *   allowance (unchanged behavior).
 * - Own-billing paid workspace: soft cap only — no token wrapper, same as
 *   before.
 *
 * Shares the reserve-before-call / release-on-failure shape of the base guard,
 * so generateReply/runMilestoneCheck still take exactly one guard.
 */
export async function wrapSpendGuardWithTokenEntitlement(
  pool: Pool,
  tenant: Tenant,
  baseGuard: AiSpendGuard,
): Promise<AiSpendGuard> {
  const effective = await resolveEffectiveBilling(pool, tenant);

  if (effective.source === "plan") {
    const cap = effective.perWorkspaceTokenCap;
    if (cap === null) return baseGuard; // uncapped — shared pool, base guard only
    const cycleStart = billingCycleStart(effective);
    return {
      async tryConsume() {
        if (!(await baseGuard.tryConsume())) return false;
        const usage = await getTokenUsageSince(pool, tenant.id, cycleStart);
        if (usage.totalTokens >= cap) {
          await baseGuard.release();
          return false;
        }
        return true;
      },
      release: () => baseGuard.release(),
    };
  }

  // Own billing. Only a trial workspace gets the cumulative token ceiling;
  // paid workspaces fall through to the base guard untouched.
  if (effective.isTrial && effective.trialStartedAt) {
    const trialStartedAt = effective.trialStartedAt;
    return {
      async tryConsume() {
        if (!(await baseGuard.tryConsume())) return false;
        const usage = await getTokenUsageSince(pool, tenant.id, trialStartedAt);
        if (usage.totalTokens >= getPlanTier("trial").tokenAllowance) {
          await baseGuard.release();
          return false;
        }
        return true;
      },
      release: () => baseGuard.release(),
    };
  }

  return baseGuard;
}
