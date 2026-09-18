import type { Pool } from "pg";

export interface Tenant {
  id: string;
  name: string;
  createdAt: Date;
}

export async function createTenant(pool: Pool, name: string): Promise<Tenant> {
  const result = await pool.query<{ id: string; name: string; created_at: Date }>(
    `insert into tenants (name) values ($1) returning id, name, created_at`,
    [name],
  );
  const row = result.rows[0]!;
  return { id: row.id, name: row.name, createdAt: row.created_at };
}
