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
 * Instagram accounts. The row is durable account identity; disconnecting an
 * account changes its health state rather than deleting the row so journey
 * bindings and historical execution identity survive credential revocation.
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
  pool: Pool,
  tenantId: string,
  accountId: string,
): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await client.query(
      `update meta_tokens
          set status = 'error',
              last_error = 'Instagram account disconnected',
              last_checked_at = now(),
              updated_at = now()
        where tenant_id = $1
          and id = $2
          and status <> 'error'`,
      [tenantId, accountId],
    );

    if ((result.rowCount ?? 0) === 0) {
      await client.query("rollback");
      return false;
    }

    await client.query(
      `update campaign_instagram_accounts
          set enabled = false, updated_at = now()
        where meta_token_id = $1`,
      [accountId],
    );

    await client.query("commit");
    return true;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Repoints an existing connected-account row from the id it was stored under
 * to the canonical professional `user_id`, keeping the row's primary key (and
 * therefore every `campaign_instagram_accounts.meta_token_id` journey binding)
 * intact. Used to heal accounts connected before the id scheme switched from
 * the app-scoped `id` to `user_id`; the subsequent `upsertToken` then updates
 * this same row instead of inserting a duplicate.
 */
export async function repointInstagramAccountId(
  pool: Queryable,
  tenantId: string,
  fromInstagramAccountId: string,
  toInstagramAccountId: string,
): Promise<void> {
  await pool.query(
    `update meta_tokens
        set instagram_account_id = $3, updated_at = now()
      where tenant_id = $1 and instagram_account_id = $2`,
    [tenantId, fromInstagramAccountId, toInstagramAccountId],
  );
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
