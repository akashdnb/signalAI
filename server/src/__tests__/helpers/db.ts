import type { Pool } from "pg";

/** Clear persistent pg-boss jobs outside the application-table reset. */
export async function clearPgBossJobs(pool: Pool, queueNames: readonly string[]): Promise<void> {
  if (queueNames.length === 0) return;
  await pool.query("delete from pgboss.job where name = any($1::text[])", [queueNames]);
}

export async function resetDb(pool: Pool): Promise<void> {
  // `tenants restart identity cascade` reaches tenant_members (it has an
  // FK TO tenants) but not `users` or `email_otp_codes` — cascade only
  // follows FKs that reference the truncated table, and neither of those
  // is referenced BY tenants, so they need listing explicitly.
  await pool.query(
    "truncate table lead_pii, lead_events, leads, customers, meta_tokens, tenants, users, email_otp_codes restart identity cascade",
  );
}
