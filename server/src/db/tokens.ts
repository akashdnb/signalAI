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
                    updated_at = now()`,
    [params.tenantId, params.instagramAccountId, ciphertext, keyVersion, params.expiresAt ?? null],
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
