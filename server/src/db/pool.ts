import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing required env var: DATABASE_URL");
    }
    pool = new Pool({ connectionString });
    // Neon closes idle connections; without a listener the pool's 'error'
    // event is unhandled and takes the whole process down. The pool discards
    // the broken client and opens a fresh one on the next query.
    pool.on("error", (err) => console.error("pg pool idle client error:", err.message));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
