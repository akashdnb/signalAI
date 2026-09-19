import type { Queryable } from "./types.js";

export type TenantMemberRole = "owner";

/** Checked by requireTenantSession (lib/tenantAuth.ts) on every dashboard/campaigns/billing request — a valid session for a user who is not a member of :tenantId is rejected, not silently rescoped. */
export async function isTenantMember(pool: Queryable, tenantId: string, userId: string): Promise<boolean> {
  const result = await pool.query(`select 1 from tenant_members where tenant_id = $1 and user_id = $2`, [
    tenantId,
    userId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function addTenantMember(
  pool: Queryable,
  tenantId: string,
  userId: string,
  role: TenantMemberRole = "owner",
): Promise<void> {
  await pool.query(
    `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, $3)
     on conflict (tenant_id, user_id) do nothing`,
    [tenantId, userId, role],
  );
}

export interface TenantMembership {
  tenantId: string;
  role: TenantMemberRole;
}

/** BUI: which workspace(s) a logged-in user lands on. Phase 1 only ever creates one (see routes/authEmail.ts's first-login tenant bootstrap) — the schema supports more for Phase 6. */
export async function listTenantsForUser(pool: Queryable, userId: string): Promise<TenantMembership[]> {
  const result = await pool.query<{ tenant_id: string; role: TenantMemberRole }>(
    `select tenant_id, role from tenant_members where user_id = $1 order by created_at`,
    [userId],
  );
  return result.rows.map((row) => ({ tenantId: row.tenant_id, role: row.role }));
}
