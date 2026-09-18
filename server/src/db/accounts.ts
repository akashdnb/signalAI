import type { Pool } from "pg";

/**
 * Resolves which tenant owns a connected Instagram professional account.
 * Meta's webhook payload only carries the account id (entry.id) — this is
 * how an inbound event finds its tenant before any lead resolution happens.
 */
export async function findTenantByInstagramAccountId(
  pool: Pool,
  instagramAccountId: string,
): Promise<string | null> {
  const result = await pool.query<{ tenant_id: string }>(
    `select tenant_id from meta_tokens where instagram_account_id = $1`,
    [instagramAccountId],
  );
  return result.rows[0]?.tenant_id ?? null;
}
