import type { Pool } from "pg";
import { addTenantMember } from "./tenantMembers.js";
import { config } from "../config.js";
import type { PlanTier } from "../lib/planTiers.js";

export type BillingStatus = "none" | "active" | "canceled";

export interface Tenant {
  id: string;
  name: string;
  ownerUserId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingStatus: BillingStatus;
  planTier: PlanTier;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  createdAt: Date;
}

interface TenantRow {
  id: string;
  name: string;
  owner_user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: BillingStatus;
  plan_tier: PlanTier;
  trial_started_at: Date | null;
  trial_ends_at: Date | null;
  created_at: Date;
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    billingStatus: row.billing_status,
    planTier: row.plan_tier,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    createdAt: row.created_at,
  };
}

/**
 * @deprecated Identity Refactor U4 removed every production caller of
 * this — a tenant is now only ever created via `createTenantForUser`,
 * alongside its owner membership. Kept only for building pre-refactor-shaped
 * test fixtures (orphan tenants with no owner) for U7's cleanup script.
 */
export async function createTenant(pool: Pool, name: string): Promise<Tenant> {
  const result = await pool.query<TenantRow>(`insert into tenants (name) values ($1) returning *`, [name]);
  return toTenant(result.rows[0]!);
}

/**
 * Identity Refactor U6: the one place a workspace comes into existence now
 * — a user's first login (see routes/authEmail.ts), not the Instagram
 * connect flow. Tenant creation, owner_user_id, and the tenant_members row
 * land in one transaction so a crash between them can never produce a
 * tenant with no owner or an owner with no membership row.
 */
export async function createTenantForUser(pool: Pool, name: string, ownerUserId: string): Promise<Tenant> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Phase 2B Free Trial Period: starts at tenant creation, not at
    // Instagram connect — a tenant should be able to explore the product
    // (create campaigns, see the dashboard) before connecting anything.
    // trialDays lives in config, not a SQL default, so the trial length is
    // a code-level product decision, not a migration.
    const trialEndsAt = new Date(Date.now() + config.trialDays * 24 * 60 * 60 * 1000);
    const result = await client.query<TenantRow>(
      `insert into tenants (name, owner_user_id, trial_started_at, trial_ends_at)
       values ($1, $2, now(), $3) returning *`,
      [name, ownerUserId, trialEndsAt],
    );
    const tenant = toTenant(result.rows[0]!);
    await addTenantMember(client, tenant.id, ownerUserId, "owner");
    await client.query("COMMIT");
    return tenant;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getTenant(pool: Pool, tenantId: string): Promise<Tenant | null> {
  const result = await pool.query<TenantRow>(`select * from tenants where id = $1`, [tenantId]);
  return result.rows[0] ? toTenant(result.rows[0]) : null;
}

/** B11: called from the Stripe Checkout success path to link the tenant to its new Stripe customer before the webhook (source of truth for activation) arrives. */
export async function setStripeCustomerId(pool: Pool, tenantId: string, stripeCustomerId: string): Promise<void> {
  await pool.query(`update tenants set stripe_customer_id = $2 where id = $1`, [tenantId, stripeCustomerId]);
}

/** B11: resolves a Stripe webhook event (which only ever carries the Stripe customer id) back to a tenant. */
export async function getTenantByStripeCustomerId(pool: Pool, stripeCustomerId: string): Promise<Tenant | null> {
  const result = await pool.query<TenantRow>(`select * from tenants where stripe_customer_id = $1`, [
    stripeCustomerId,
  ]);
  return result.rows[0] ? toTenant(result.rows[0]) : null;
}

/** B11: the webhook is the only source of truth for activation/cancellation — never set this from the Checkout success redirect, which fires before payment is guaranteed to have actually settled. */
export async function setBillingStatus(
  pool: Pool,
  tenantId: string,
  billingStatus: BillingStatus,
  stripeSubscriptionId?: string | null,
): Promise<void> {
  await pool.query(
    `update tenants set billing_status = $2, stripe_subscription_id = coalesce($3, stripe_subscription_id) where id = $1`,
    [tenantId, billingStatus, stripeSubscriptionId ?? null],
  );
}

/** Phase 2B Plan Tiers: set from the Stripe webhook once checkout.session.completed resolves which tier was purchased (via Checkout session metadata — see routes/billing.ts). */
export async function setPlanTier(pool: Pool, tenantId: string, planTier: PlanTier): Promise<void> {
  await pool.query(`update tenants set plan_tier = $2 where id = $1`, [tenantId, planTier]);
}

/**
 * Phase 2B Trial-Abuse Guardrail: called when an Instagram account that
 * already has a trial elsewhere connects to a NEW tenant — that tenant's
 * trial ends immediately (trial_ends_at = now()) rather than running the
 * full trialDays window a second time on the same underlying account.
 * plan_tier itself isn't touched here: a tenant past trial_ends_at is
 * gated by the trial-expiry check wherever quotas are enforced, the same
 * way an ordinary trial's natural expiry is — this just moves that
 * boundary to "now" instead of leaving it dangling on abuse.
 */
export async function endTrialImmediately(pool: Pool, tenantId: string): Promise<void> {
  await pool.query(`update tenants set trial_ends_at = now() where id = $1 and plan_tier = 'trial'`, [tenantId]);
}
