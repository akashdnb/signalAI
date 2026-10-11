import type { Pool, PoolClient } from "pg";

export interface ConnectedInstagramAccount {
  id: string;
  tenantId: string;
  instagramAccountId: string;
  status: "healthy" | "error";
  lastError: string | null;
  lastCheckedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Queryable = Pool | PoolClient;

function mapRow(row: Record<string, unknown>): ConnectedInstagramAccount {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    instagramAccountId: String(row.instagram_account_id),
    status: String(row.status) as ConnectedInstagramAccount["status"],
    lastError: row.last_error == null ? null : String(row.last_error),
    lastCheckedAt: String(row.last_checked_at),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * `meta_tokens` is currently the canonical credential store for connected
 * Instagram accounts. Keep this repository as the account abstraction so
 * callers stop depending directly on token storage and the underlying table
 * can be migrated later without changing route/runtime consumers.
 */
export async function listConnectedInstagramAccounts(
  pool: Queryable,
  tenantId: string,
): Promise<ConnectedInstagramAccount[]> {
  const result = await pool.query(
    `select id, tenant_id, instagram_account_id, status, last_error,
            last_checked_at, expires_at, created_at, updated_at
       from meta_tokens
      where tenant_id = $1
      order by created_at asc`,
    [tenantId],
  );

  return result.rows.map(mapRow);
}

export async function getConnectedInstagramAccount(
  pool: Queryable,
  tenantId: string,
  accountId: string,
): Promise<ConnectedInstagramAccount | null> {
  const result = await pool.query(
    `select id, tenant_id, instagram_account_id, status, last_error,
            last_checked_at, expires_at, created_at, updated_at
       from meta_tokens
      where tenant_id = $1 and id = $2
      limit 1`,
    [tenantId, accountId],
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteConnectedInstagramAccount(
  pool: Queryable,
  tenantId: string,
  accountId: string,
): Promise<boolean> {
  const result = await pool.query(
    `delete from meta_tokens
      where tenant_id = $1 and id = $2`,
    [tenantId, accountId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getConnectedInstagramAccountByProviderId(
  pool: Queryable,
  instagramAccountId: string,
): Promise<ConnectedInstagramAccount | null> {
  const result = await pool.query(
    `select id, tenant_id, instagram_account_id, status, last_error,
            last_checked_at, expires_at, created_at, updated_at
       from meta_tokens
      where instagram_account_id = $1
      limit 1`,
    [instagramAccountId],
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
