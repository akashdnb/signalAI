import type { Pool } from "pg";

export async function resetDb(pool: Pool): Promise<void> {
  // `tenants restart identity cascade` reaches tenant_members (it has an
  // FK TO tenants) but not `users` or `magic_link_tokens` — cascade only
  // follows FKs that reference the truncated table, and neither of those
  // is referenced BY tenants, so they need listing explicitly.
  await pool.query(
    "truncate table lead_pii, lead_events, leads, meta_tokens, tenants, users, magic_link_tokens restart identity cascade",
  );
}
