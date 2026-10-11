import type { Pool } from "pg";
import { currentKeyVersion, decryptToken, encryptToken } from "../lib/tokenVault.js";

export async function upsertToken(
  pool: Pool,
  keyring: Map<string, Buffer>,
  params: {
    tenantId: string;
    instagramAccountId: string;
    accessToken: string;
    expiresAt?: Date;
  },
): Promise<void> {
  const keyVersion = currentKeyVersion(keyring);
  const key = keyring.get(keyVersion)!;
  const { ciphertext } = encryptToken(params.accessToken, key, keyVersion);

  await pool.query(
    `insert into meta_tokens (tenant_id, instagram_account_id, encrypted_token, key_version, expires_at)
     values ($1, $2, $3, $4, $5)
     on conflict (instagram_account_id)
     do update set tenant_id = excluded.tenant_id,
                    encrypted_token = excluded.encrypted_token,
                    key_version = excluded.key_version,
                    expires_at = excluded.expires_at,
                    status = 'healthy',
                    last_error = null,
                    last_checked_at = now(),
                    updated_at = now()`,
    [params.tenantId, params.instagramAccountId, ciphertext, keyVersion, params.expiresAt ?? null],
  );

  // Reconnection restores previously configured journey/account bindings.
  // The binding rows are durable configuration; `enabled` only reflects
  // whether the referenced connection is currently usable.
  await pool.query(
    `update campaign_instagram_accounts cia
        set enabled = true, updated_at = now()
       from meta_tokens mt
      where cia.meta_token_id = mt.id
        and mt.tenant_id = $1
        and mt.instagram_account_id = $2`,
    [params.tenantId, params.instagramAccountId],
  );
}

export interface TokenHealthRow {
  tenantId: string;
  instagramAccountId: string;
  expiresAt: Date | null;
  status: "healthy" | "error";
}

export async function listTokensDueForRefresh(pool: Pool, withinDays: number): Promise<TokenHealthRow[]> {
  const result = await pool.query<{
    tenant_id: string;
    instagram_account_id: string;
    expires_at: Date | null;
    status: "healthy" | "error";
  }>(
    `select tenant_id, instagram_account_id, expires_at, status from meta_tokens
     where expires_at is not null
       and expires_at < now() + ($1 || ' days')::interval
       and updated_at < now() - interval '24 hours'`,
    [withinDays],
  );
  return result.rows.map((row) => ({
    tenantId: row.tenant_id,
    instagramAccountId: row.instagram_account_id,
    expiresAt: row.expires_at,
    status: row.status,
  }));
}

export async function markTokenError(
  pool: Pool,
  tenantId: string,
  instagramAccountId: string,
  error: string,
): Promise<void> {
  await pool.query(
    `update meta_tokens set status = 'error', last_error = $3, last_checked_at = now()
     where tenant_id = $1 and instagram_account_id = $2`,
    [tenantId, instagramAccountId, error],
  );
}

/**
 * Legacy compatibility only. Account-less executions may use this fallback
 * only when the tenant has exactly one healthy connected Instagram account.
 */
export async function getSoleConnectedAccount(
  pool: Pool,
  tenantId: string,
): Promise<{ instagramAccountId: string } | null> {
  const result = await pool.query<{ instagram_account_id: string }>(
    `select instagram_account_id
       from meta_tokens
      where tenant_id = $1
        and status = 'healthy'
      order by created_at
      limit 2`,
    [tenantId],
  );

  if (result.rows.length !== 1) return null;
  return { instagramAccountId: result.rows[0]!.instagram_account_id };
}

export interface AccountHealth {
  instagramAccountId: string;
  status: "healthy" | "error";
  lastError: string | null;
  lastCheckedAt: Date;
  expiresAt: Date | null;
}

export async function getAccountHealth(pool: Pool, tenantId: string): Promise<AccountHealth | null> {
  const result = await pool.query<{
    instagram_account_id: string;
    status: "healthy" | "error";
    last_error: string | null;
    last_checked_at: Date;
    expires_at: Date | null;
  }>(
    `select instagram_account_id, status, last_error, last_checked_at, expires_at
     from meta_tokens where tenant_id = $1 order by created_at limit 1`,
    [tenantId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    instagramAccountId: row.instagram_account_id,
    status: row.status,
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Decrypts on the way out — plaintext exists only for the provider call.
 * Disconnected/error accounts cannot be used for outbound sends.
 */
export async function getDecryptedToken(
  pool: Pool,
  keyring: Map<string, Buffer>,
  tenantId: string,
  instagramAccountId: string,
): Promise<string | null> {
  const result = await pool.query<{ encrypted_token: Buffer; key_version: string }>(
    `select encrypted_token, key_version from meta_tokens
     where tenant_id = $1
       and instagram_account_id = $2
       and status = 'healthy'`,
    [tenantId, instagramAccountId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const key = keyring.get(row.key_version);
  if (!key) {
    throw new Error(`No key available for key_version ${row.key_version} — cannot decrypt token`);
  }

  return decryptToken(row.encrypted_token, key);
}

export async function deleteTokensForTenant(pool: Pool, tenantId: string): Promise<number> {
  const result = await pool.query(`delete from meta_tokens where tenant_id = $1`, [tenantId]);
  return result.rowCount ?? 0;
}
