import type { Pool } from "pg";
import type { Queryable } from "./types.js";

/**
 * Agency Bulk Billing (docs/AGENCY_WORKSPACES_AND_BULK_BILLING_PLAN.md).
 *
 * A billing_account is the PARENT payer — one personal-email user, one Stripe
 * subscription — that covers several workspaces listed in
 * billing_account_tenants. Everything here is additive to the per-workspace
 * billing columns on `tenants`: a tenant with no coverage row is unaffected.
 */

export type BillingAccountStatus = "none" | "active" | "past_due" | "canceled";
export type BillingAccountPlan = "agency_bulk";

export interface BillingAccount {
  id: string;
  ownerUserId: string;
  plan: BillingAccountPlan;
  workspaceLimit: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingStatus: BillingAccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface BillingAccountRow {
  id: string;
  owner_user_id: string;
  plan: BillingAccountPlan;
  workspace_limit: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: BillingAccountStatus;
  created_at: Date;
  updated_at: Date;
}

function toBillingAccount(row: BillingAccountRow): BillingAccount {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    plan: row.plan,
    workspaceLimit: row.workspace_limit,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    billingStatus: row.billing_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CoveredWorkspace {
  tenantId: string;
  name: string;
  perWorkspaceTokenCap: number | null;
  addedAt: Date;
}

export interface WorkspaceCoverage {
  billingAccountId: string;
  billingStatus: BillingAccountStatus;
  perWorkspaceTokenCap: number | null;
}

export async function createBillingAccount(
  pool: Pool,
  ownerUserId: string,
  workspaceLimit: number,
  plan: BillingAccountPlan = "agency_bulk",
): Promise<BillingAccount> {
  const result = await pool.query<BillingAccountRow>(
    `insert into billing_accounts (owner_user_id, plan, workspace_limit)
     values ($1, $2, $3) returning *`,
    [ownerUserId, plan, workspaceLimit],
  );
  return toBillingAccount(result.rows[0]!);
}

export async function getBillingAccount(pool: Queryable, id: string): Promise<BillingAccount | null> {
  const result = await pool.query<BillingAccountRow>(`select * from billing_accounts where id = $1`, [id]);
  return result.rows[0] ? toBillingAccount(result.rows[0]) : null;
}

/** The single plan a user owns, if any (one plan per owner — unique index). */
export async function getBillingAccountByOwner(pool: Queryable, ownerUserId: string): Promise<BillingAccount | null> {
  const result = await pool.query<BillingAccountRow>(`select * from billing_accounts where owner_user_id = $1`, [
    ownerUserId,
  ]);
  return result.rows[0] ? toBillingAccount(result.rows[0]) : null;
}

export async function getBillingAccountByStripeCustomerId(
  pool: Queryable,
  stripeCustomerId: string,
): Promise<BillingAccount | null> {
  const result = await pool.query<BillingAccountRow>(`select * from billing_accounts where stripe_customer_id = $1`, [
    stripeCustomerId,
  ]);
  return result.rows[0] ? toBillingAccount(result.rows[0]) : null;
}

/** The plan covering a given workspace, if any — at most one row (tenant_id is unique). */
export async function getWorkspaceCoverage(pool: Queryable, tenantId: string): Promise<WorkspaceCoverage | null> {
  const result = await pool.query<{
    billing_account_id: string;
    billing_status: BillingAccountStatus;
    per_workspace_token_cap: string | null;
  }>(
    `select bat.billing_account_id, ba.billing_status, bat.per_workspace_token_cap
       from billing_account_tenants bat
       join billing_accounts ba on ba.id = bat.billing_account_id
      where bat.tenant_id = $1`,
    [tenantId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    billingAccountId: row.billing_account_id,
    billingStatus: row.billing_status,
    // bigint comes back as a string from pg — normalize to number (token
    // counts never approach Number.MAX_SAFE_INTEGER at any realistic scale).
    perWorkspaceTokenCap: row.per_workspace_token_cap === null ? null : Number(row.per_workspace_token_cap),
  };
}

export async function listCoveredWorkspaces(pool: Queryable, billingAccountId: string): Promise<CoveredWorkspace[]> {
  const result = await pool.query<{
    tenant_id: string;
    name: string;
    per_workspace_token_cap: string | null;
    added_at: Date;
  }>(
    `select bat.tenant_id, t.name, bat.per_workspace_token_cap, bat.added_at
       from billing_account_tenants bat
       join tenants t on t.id = bat.tenant_id
      where bat.billing_account_id = $1
      order by bat.added_at`,
    [billingAccountId],
  );
  return result.rows.map((row) => ({
    tenantId: row.tenant_id,
    name: row.name,
    perWorkspaceTokenCap: row.per_workspace_token_cap === null ? null : Number(row.per_workspace_token_cap),
    addedAt: row.added_at,
  }));
}

export async function countCoveredWorkspaces(pool: Queryable, billingAccountId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from billing_account_tenants where billing_account_id = $1`,
    [billingAccountId],
  );
  return result.rows[0]!.count;
}

export type AddWorkspaceResult = "added" | "already_covered" | "limit_reached";

/**
 * Adds a workspace to a plan under the workspace_limit, atomically. The row
 * lock on the billing_accounts row serializes concurrent adds so two parallel
 * requests can't both slip past the limit. A tenant already covered by ANY
 * plan (its own or another) fails the unique(tenant_id) constraint — surfaced
 * here as 'already_covered' rather than a raw error.
 */
export async function addWorkspaceToBillingAccount(
  pool: Pool,
  billingAccountId: string,
  tenantId: string,
): Promise<AddWorkspaceResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query<{ workspace_limit: number }>(
      `select workspace_limit from billing_accounts where id = $1 for update`,
      [billingAccountId],
    );
    if (!account.rows[0]) {
      await client.query("ROLLBACK");
      throw new Error(`billing account ${billingAccountId} not found`);
    }

    // Covered by any plan already (this one or another) — the unique(tenant_id)
    // constraint is the real backstop; this pre-check just turns the common
    // case into a clean result instead of a constraint error.
    const existing = await client.query(
      `select 1 from billing_account_tenants where tenant_id = $1`,
      [tenantId],
    );
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return "already_covered";
    }

    const count = await client.query<{ count: number }>(
      `select count(*)::int as count from billing_account_tenants where billing_account_id = $1`,
      [billingAccountId],
    );
    if (count.rows[0]!.count >= account.rows[0].workspace_limit) {
      await client.query("ROLLBACK");
      return "limit_reached";
    }

    await client.query(
      `insert into billing_account_tenants (billing_account_id, tenant_id) values ($1, $2)`,
      [billingAccountId, tenantId],
    );
    await client.query("COMMIT");
    return "added";
  } catch (err) {
    await client.query("ROLLBACK");
    // Two different plans adding the same tenant concurrently lock different
    // rows, both pass the pre-check, and one loses the unique(tenant_id) race.
    // Map that to the same result as the pre-check rather than a 500.
    if ((err as { code?: string }).code === "23505") return "already_covered";
    throw err;
  } finally {
    client.release();
  }
}

export async function removeWorkspaceFromBillingAccount(
  pool: Pool,
  billingAccountId: string,
  tenantId: string,
): Promise<boolean> {
  const result = await pool.query(
    `delete from billing_account_tenants where billing_account_id = $1 and tenant_id = $2`,
    [billingAccountId, tenantId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Sets (or clears, with null) a workspace's soft per-cycle token cap. Returns false if the workspace isn't covered by this plan. */
export async function setWorkspaceTokenCap(
  pool: Pool,
  billingAccountId: string,
  tenantId: string,
  cap: number | null,
): Promise<boolean> {
  const result = await pool.query(
    `update billing_account_tenants set per_workspace_token_cap = $3
      where billing_account_id = $1 and tenant_id = $2`,
    [billingAccountId, tenantId, cap],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setBillingAccountStripeCustomer(
  pool: Pool,
  billingAccountId: string,
  stripeCustomerId: string,
): Promise<void> {
  await pool.query(
    `update billing_accounts set stripe_customer_id = $2, updated_at = now() where id = $1`,
    [billingAccountId, stripeCustomerId],
  );
}

export async function setBillingAccountStatus(
  pool: Pool,
  billingAccountId: string,
  billingStatus: BillingAccountStatus,
  stripeSubscriptionId?: string | null,
): Promise<void> {
  await pool.query(
    `update billing_accounts
        set billing_status = $2,
            stripe_subscription_id = coalesce($3, stripe_subscription_id),
            updated_at = now()
      where id = $1`,
    [billingAccountId, billingStatus, stripeSubscriptionId ?? null],
  );
}
