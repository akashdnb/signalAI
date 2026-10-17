import type { Pool } from "pg";

export interface InstagramAccountResolution {
  id: string;
  tenantId: string;
  instagramUserId: string;
}

/**
 * Resolve a provider webhook account ID to its owning workspace and the
 * durable credential row. The global unique index on meta_tokens.account_id
 * is the invariant that makes this mapping unambiguous across workspaces.
 *
 * Deliberately does not fall back to "first row": ambiguity is an integrity
 * failure and must fail closed rather than route a webhook to an arbitrary
 * customer's workspace.
 */
export async function resolveInstagramAccount(
  pool: Pool,
  instagramAccountId: string,
): Promise<InstagramAccountResolution | null> {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    instagram_account_id: string;
  }>(
    `
      select id, tenant_id, instagram_account_id
        from meta_tokens
       where instagram_account_id = $1
       limit 2
    `,
    [instagramAccountId],
  );

  if (result.rows.length > 1) {
    throw new Error("Instagram account identity is not unique across workspaces");
  }

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    instagramUserId: String(row.instagram_account_id),
  };
}
