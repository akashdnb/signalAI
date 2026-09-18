import type { Pool } from "pg";

export async function resetDb(pool: Pool): Promise<void> {
  await pool.query(
    "truncate table lead_pii, lead_events, leads, meta_tokens, tenants restart identity cascade",
  );
}
