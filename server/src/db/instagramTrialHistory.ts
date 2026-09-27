import type { Queryable } from "./types.js";

/**
 * Phase 2B Trial-Abuse Guardrail. Call once, at Instagram connect time
 * (routes/auth.ts's OAuth callback — the first point a tenant has a real,
 * verified Instagram identity, which is what trial eligibility is tied
 * to, not the email/signup that already existed at tenant creation).
 *
 * Returns true the FIRST time this instagram_account_id is ever seen
 * (across any tenant, ever) — that tenant's trial stands. Returns false
 * on every subsequent connect of the same account, whether by the same
 * tenant reconnecting (harmless — their trial window is unaffected either
 * way) or a DIFFERENT tenant trying to claim a second trial with an
 * account that already used one (the actual abuse case) — the caller
 * (routes/auth.ts) only needs to act on the second case, but can't
 * distinguish it from the first without also checking whether
 * first_tenant_id equals the connecting tenant.
 */
export async function registerInstagramTrialUse(
  pool: Queryable,
  instagramAccountId: string,
  tenantId: string,
): Promise<{ isFirstUse: boolean; firstTenantId: string }> {
  const result = await pool.query<{ first_tenant_id: string; is_first_use: boolean }>(
    `insert into instagram_trial_history (instagram_account_id, first_tenant_id)
     values ($1, $2)
     on conflict (instagram_account_id) do update set instagram_account_id = excluded.instagram_account_id
     returning first_tenant_id, (xmax = 0) as is_first_use`,
    [instagramAccountId, tenantId],
  );
  const row = result.rows[0]!;
  return { isFirstUse: row.is_first_use, firstTenantId: row.first_tenant_id };
}
