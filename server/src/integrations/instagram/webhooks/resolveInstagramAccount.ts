import type { Pool } from "pg";

export interface InstagramAccountResolution {
  id: string;
  tenantId: string;
  instagramUserId: string;
}

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
      select
        id,
        tenant_id,
        instagram_account_id
      from meta_tokens
      where instagram_account_id = $1
      limit 1
    `,
    [instagramAccountId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    instagramUserId: String(row.instagram_account_id),
  };
}
