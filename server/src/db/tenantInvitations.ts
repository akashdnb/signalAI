import type { Pool, PoolClient } from "pg";

export type TenantInvitationRole = "admin" | "member";

export interface TenantInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: TenantInvitationRole;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

type Queryable = Pool | PoolClient;

function mapRow(row: Record<string, unknown>): TenantInvitation {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    email: String(row.email),
    role: String(row.role) as TenantInvitationRole,
    expiresAt: String(row.expires_at),
    acceptedAt: row.accepted_at == null ? null : String(row.accepted_at),
    revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
    createdAt: String(row.created_at),
  };
}

export async function listTenantInvitations(
  pool: Queryable,
  tenantId: string,
): Promise<TenantInvitation[]> {
  const result = await pool.query(
    `select id, tenant_id, email, role, expires_at, accepted_at, revoked_at, created_at
       from tenant_invitations
      where tenant_id = $1
      order by created_at desc`,
    [tenantId],
  );
  return result.rows.map(mapRow);
}

export async function getPendingInvitationForEmail(
  pool: Queryable,
  tenantId: string,
  email: string,
): Promise<TenantInvitation | null> {
  const result = await pool.query(
    `select id, tenant_id, email, role, expires_at, accepted_at, revoked_at, created_at
       from tenant_invitations
      where tenant_id = $1
        and email = $2
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
      order by created_at desc
      limit 1`,
    [tenantId, email],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createTenantInvitation(
  pool: Queryable,
  input: {
    tenantId: string;
    email: string;
    role: TenantInvitationRole;
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
  },
): Promise<TenantInvitation> {
  const result = await pool.query(
    `insert into tenant_invitations
      (tenant_id, email, role, token_hash, invited_by, expires_at)
     values ($1, $2, $3, $4, $5, $6)
     returning id, tenant_id, email, role, expires_at, accepted_at, revoked_at, created_at`,
    [
      input.tenantId,
      input.email,
      input.role,
      input.tokenHash,
      input.invitedBy,
      input.expiresAt,
    ],
  );
  return mapRow(result.rows[0]);
}

export async function revokeTenantInvitation(
  pool: Queryable,
  tenantId: string,
  invitationId: string,
): Promise<boolean> {
  const result = await pool.query(
    `update tenant_invitations
        set revoked_at = coalesce(revoked_at, now()), updated_at = now()
      where id = $1 and tenant_id = $2 and accepted_at is null`,
    [invitationId, tenantId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function acceptTenantInvitation(
  client: PoolClient,
  tokenHash: string,
  userId: string,
  email: string,
): Promise<TenantInvitation | null> {
  const result = await client.query(
    `update tenant_invitations
        set accepted_at = now(), updated_at = now()
      where token_hash = $1
        and email = $2
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
      returning id, tenant_id, email, role, expires_at, accepted_at, revoked_at, created_at`,
    [tokenHash, email],
  );

  const invitation = result.rows[0] ? mapRow(result.rows[0]) : null;
  if (!invitation) return null;

  await client.query(
    `insert into tenant_members (tenant_id, user_id, role)
     values ($1, $2, $3)
     on conflict (tenant_id, user_id)
     do update set role = excluded.role`,
    [invitation.tenantId, userId, invitation.role],
  );

  return invitation;
}
