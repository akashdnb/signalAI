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
type HttpConflictError = Error & { statusCode?: number };

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
        and lower(email) = lower($2)
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
      order by created_at desc
      limit 1`,
    [tenantId, email],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Creates an invitation while serializing concurrent invitations for the
 * same tenant/email. Expired invitations are revoked under the same lock,
 * allowing a new invitation without weakening the database unique index.
 */
export async function createTenantInvitation(
  pool: Pool,
  input: {
    tenantId: string;
    email: string;
    role: TenantInvitationRole;
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
  },
): Promise<TenantInvitation> {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${input.tenantId}:${input.email.toLowerCase()}`],
    );

    await client.query(
      `update tenant_invitations
          set revoked_at = now(), updated_at = now()
        where tenant_id = $1
          and lower(email) = lower($2)
          and accepted_at is null
          and revoked_at is null
          and expires_at <= now()`,
      [input.tenantId, input.email],
    );

    const result = await client.query(
      `insert into tenant_invitations
        (tenant_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id, tenant_id, email, role, expires_at, accepted_at, revoked_at, created_at`,
      [input.tenantId, input.email, input.role, input.tokenHash, input.invitedBy, input.expiresAt],
    );

    await client.query("commit");
    return mapRow(result.rows[0]);
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original database error.
    }

    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
      const conflict = new Error("an invitation is already pending for this email") as HttpConflictError;
      conflict.statusCode = 409;
      throw conflict;
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Replaces an existing active invitation atomically. The advisory lock keeps
 * resend concurrent with invite creation/retry-safe for the same tenant/email.
 */
export async function resendTenantInvitation(
  pool: Pool,
  input: {
    tenantId: string;
    invitationId: string;
    tokenHash: string;
    expiresAt: Date;
  },
): Promise<TenantInvitation | null> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const current = await client.query<{
      email: string;
      role: TenantInvitationRole;
      invited_by: string;
    }>(
      `select email, role, invited_by
         from tenant_invitations
        where id = $1
          and tenant_id = $2
          and accepted_at is null
          and revoked_at is null
          and expires_at > now()
        for update`,
      [input.invitationId, input.tenantId],
    );
    const row = current.rows[0];
    if (!row) {
      await client.query("rollback");
      return null;
    }

    await client.query(
      `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${input.tenantId}:${row.email.toLowerCase()}`],
    );

    await client.query(
      `update tenant_invitations
          set revoked_at = now(), updated_at = now()
        where id = $1 and tenant_id = $2 and accepted_at is null and revoked_at is null`,
      [input.invitationId, input.tenantId],
    );

    const replacement = await client.query(
      `insert into tenant_invitations
        (tenant_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id, tenant_id, email, role, expires_at, accepted_at, revoked_at, created_at`,
      [
        input.tenantId,
        row.email,
        row.role,
        input.tokenHash,
        row.invited_by,
        input.expiresAt,
      ],
    );

    await client.query("commit");
    return mapRow(replacement.rows[0]);
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original database error.
    }
    throw error;
  } finally {
    client.release();
  }
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

export async function updateTenantMemberRole(
  pool: Queryable,
  tenantId: string,
  actorUserId: string,
  memberUserId: string,
  role: TenantInvitationRole,
): Promise<boolean> {
  if (actorUserId === memberUserId) {
    const error = new Error("you cannot change your own role") as HttpConflictError;
    error.statusCode = 409;
    throw error;
  }

  const result = await pool.query(
    `update tenant_members
        set role = $1
      where tenant_id = $2
        and user_id = $3
        and role <> 'owner'`,
    [role, tenantId, memberUserId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function removeTenantMember(
  pool: Queryable,
  tenantId: string,
  actorUserId: string,
  memberUserId: string,
): Promise<boolean> {
  if (actorUserId === memberUserId) {
    const error = new Error("you cannot remove yourself from this tenant") as HttpConflictError;
    error.statusCode = 409;
    throw error;
  }

  const result = await pool.query(
    `delete from tenant_members
      where tenant_id = $1
        and user_id = $2
        and role <> 'owner'`,
    [tenantId, memberUserId],
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
        and lower(email) = lower($2)
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
      returning id, tenant_id, email, role, expires_at, accepted_at, revoked_at, created_at`,
    [tokenHash, email],
  );

  const invitation = result.rows[0] ? mapRow(result.rows[0]) : null;
  if (!invitation) return null;

  const existingMember = await client.query<{ role: "owner" | "admin" | "member" }>(
    `select role
       from tenant_members
      where tenant_id = $1 and user_id = $2
      for update`,
    [invitation.tenantId, userId],
  );

  if (existingMember.rows[0]) {
    const conflict = new Error("user is already a member of this tenant") as HttpConflictError;
    conflict.statusCode = 409;
    throw conflict;
  }

  await client.query(
    `insert into tenant_members (tenant_id, user_id, role)
     values ($1, $2, $3)`,
    [invitation.tenantId, userId, invitation.role],
  );

  return invitation;
}
