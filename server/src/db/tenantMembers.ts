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

/** The caller's role in a tenant, or null if they are not a member. Used by agency-plan management to require workspace ownership before covering it. */
export async function getTenantMemberRole(
  pool: Queryable,
  tenantId: string,
  userId: string,
): Promise<"owner" | "admin" | "member" | null> {
  const result = await pool.query<{ role: "owner" | "admin" | "member" }>(
    `select role from tenant_members where tenant_id = $1 and user_id = $2 limit 1`,
    [tenantId, userId],
  );
  return result.rows[0]?.role ?? null;
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

/** A membership role as stored in tenant_members — owner at creation, admin/member via invitations. */
export type WorkspaceRole = "owner" | "admin" | "member";

export interface WorkspaceSummary {
  tenantId: string;
  name: string;
  description: string | null;
  role: WorkspaceRole;
}

/**
 * Agency Workspaces: the full list a logged-in user can switch between,
 * joined with the display fields the switcher needs (name, description).
 * `listTenantsForUser` above returns only ids/roles for the per-request
 * membership check; this is the richer read for the BUI workspace menu.
 */
export async function listWorkspacesForUser(pool: Queryable, userId: string): Promise<WorkspaceSummary[]> {
  const result = await pool.query<{
    tenant_id: string;
    name: string;
    description: string | null;
    role: WorkspaceRole;
  }>(
    `select tm.tenant_id, t.name, t.description, tm.role
       from tenant_members tm
       join tenants t on t.id = tm.tenant_id
      where tm.user_id = $1
      order by tm.created_at`,
    [userId],
  );
  return result.rows.map((row) => ({
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    role: row.role,
  }));
}

export interface TenantMemberSummary {
  userId: string;
  email: string;
  role: TenantMemberRole;
}

/**
 * Phase 2A Lead Ownership/Assignment: who a lead can be assigned to.
 * Today this is always exactly one row (the owner from first login) — the
 * feature is still worth shipping now, on the schema that already supports
 * more members, rather than waiting for Phase 6 to actually add teammates.
 */
export async function listTenantMembers(pool: Queryable, tenantId: string): Promise<TenantMemberSummary[]> {
  const result = await pool.query<{ user_id: string; email: string; role: TenantMemberRole }>(
    `select tm.user_id, u.email, tm.role
     from tenant_members tm
     join users u on u.id = tm.user_id
     where tm.tenant_id = $1
     order by tm.created_at`,
    [tenantId],
  );
  return result.rows.map((row) => ({ userId: row.user_id, email: row.email, role: row.role }));
}
