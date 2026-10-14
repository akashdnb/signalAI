import type { Pool } from "pg";
import type { Tenant } from "../db/tenants.js";
import {
  getWorkspaceCoverage,
  countCoveredWorkspaces,
  type BillingAccountStatus,
} from "../db/billingAccounts.js";
import {
  getPlanTier,
  AGENCY_PER_WORKSPACE_TOKEN_ALLOWANCE,
  AGENCY_PLAN_LABEL,
} from "../lib/planTiers.js";

/**
 * Agency Bulk Billing — the "effective billing" resolver
 * (docs/AGENCY_WORKSPACES_AND_BULK_BILLING_PLAN.md §2.2).
 *
 * The single place that answers "what billing actually governs this
 * workspace right now": its covering agency plan if one is active, otherwise
 * its own per-workspace billing columns. Every entitlement/quota decision
 * should go through here instead of reading tenant.plan_tier / billing_status
 * directly, so a plan-covered workspace is treated as active regardless of
 * its own (possibly expired) trial — which also neatly nullifies the
 * endTrialImmediately guardrail for agency workspaces.
 */

export interface EffectiveBilling {
  /** 'plan' when an active agency plan covers this workspace, else 'own'. */
  source: "plan" | "own";
  billingStatus: BillingAccountStatus;
  planLabel: string;
  /** Entitled to AI features right now (active plan, or own active/unexpired-trial). */
  isEntitled: boolean;
  /** True only on the own-billing trial path — the agency plan is never a trial. */
  isTrial: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  /** Own tier's included tokens, or the plan's shared-pool allowance (per-workspace allowance × covered count). */
  tokenAllowance: number;
  /** Plan-only soft cap: reject this workspace's AI once it spends this many tokens in a cycle. null = no cap. */
  perWorkspaceTokenCap: number | null;
  billingAccountId: string | null;
}

export async function resolveEffectiveBilling(
  pool: Pool,
  tenant: Tenant,
  now: Date = new Date(),
): Promise<EffectiveBilling> {
  const coverage = await getWorkspaceCoverage(pool, tenant.id);

  // An agency plan governs the workspace only while it is actually active.
  // A past_due/canceled/none plan falls through to the workspace's own
  // billing — i.e. coverage lapses the moment the parent stops paying.
  if (coverage && coverage.billingStatus === "active") {
    const coveredCount = await countCoveredWorkspaces(pool, coverage.billingAccountId);
    return {
      source: "plan",
      billingStatus: "active",
      planLabel: AGENCY_PLAN_LABEL,
      isEntitled: true,
      isTrial: false,
      trialStartedAt: null,
      trialEndsAt: null,
      tokenAllowance: coveredCount * AGENCY_PER_WORKSPACE_TOKEN_ALLOWANCE,
      perWorkspaceTokenCap: coverage.perWorkspaceTokenCap,
      billingAccountId: coverage.billingAccountId,
    };
  }

  // Own per-workspace billing — identical semantics to the pre-agency code
  // (see routes/billing.ts's /usage handler).
  const tierDef = getPlanTier(tenant.planTier);
  const isTrial = tenant.planTier === "trial";
  const isTrialExpired = isTrial && !!tenant.trialEndsAt && tenant.trialEndsAt < now;
  const isEntitled = tenant.billingStatus === "active" || (isTrial && !isTrialExpired);

  return {
    source: "own",
    billingStatus: tenant.billingStatus,
    planLabel: tierDef.label,
    isEntitled,
    isTrial,
    trialStartedAt: tenant.trialStartedAt,
    trialEndsAt: tenant.trialEndsAt,
    tokenAllowance: tierDef.tokenAllowance,
    perWorkspaceTokenCap: null,
    billingAccountId: null,
  };
}

/** The start of the current billing cycle used for cap/usage math: the whole trial for a trial workspace, else the 1st of the current UTC month. Mirrors routes/billing.ts. */
export function billingCycleStart(effective: EffectiveBilling, now: Date = new Date()): Date {
  if (effective.source === "own" && effective.isTrial && effective.trialStartedAt) {
    return effective.trialStartedAt;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
