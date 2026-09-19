import type { Pool } from "pg";

export type BillingStatus = "none" | "active" | "canceled";

export interface Tenant {
  id: string;
  name: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingStatus: BillingStatus;
  createdAt: Date;
}

interface TenantRow {
  id: string;
  name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: BillingStatus;
  created_at: Date;
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    billingStatus: row.billing_status,
    createdAt: row.created_at,
  };
}

export async function createTenant(pool: Pool, name: string): Promise<Tenant> {
  const result = await pool.query<TenantRow>(`insert into tenants (name) values ($1) returning *`, [name]);
  return toTenant(result.rows[0]!);
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
