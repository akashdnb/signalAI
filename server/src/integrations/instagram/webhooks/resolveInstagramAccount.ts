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
  const result = await pool.query(
    `
      select
        id,
        tenant_id,
        instagram_user_id
      from instagram_accounts
      where instagram_user_id = $1
      limit 1
    `,
    [instagramAccountId],
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    instagramUserId: String(row.instagram_user_id),
  };
}
