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
     on conflict (tenant_id, instagram_account_id)
     do update set encrypted_token = excluded.encrypted_token,
                    key_version = excluded.key_version,
                    expires_at = excluded.expires_at,
                    status = 'healthy',
                    last_error = null,
                    last_checked_at = now(),
                    updated_at = now()`,
    [params.tenantId, params.instagramAccountId, ciphertext, keyVersion, params.expiresAt ?? null],
  );
}

export interface TokenHealthRow {
  tenantId: string;
  instagramAccountId: string;
  expiresAt: Date | null;
  status: "healthy" | "error";
}

/**
 * Tokens due for a refresh attempt (Account Health Monitoring). A
 * long-lived token can only be refreshed once it's at least 24h old, so
 * this only ever returns tokens both nearing expiry AND old enough to
 * refresh — a token connected minutes ago never shows up here even if its
 * expiry window is somehow already close.
 */
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
 * Decrypts on the way out — the plaintext token should only ever exist in
 * memory for the duration of the Graph API call that needs it.
 */
export async function getDecryptedToken(
  pool: Pool,
  keyring: Map<string, Buffer>,
  tenantId: string,
  instagramAccountId: string,
): Promise<string | null> {
  const result = await pool.query<{ encrypted_token: Buffer; key_version: string }>(
    `select encrypted_token, key_version from meta_tokens
     where tenant_id = $1 and instagram_account_id = $2`,
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
