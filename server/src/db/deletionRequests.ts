import type { Pool } from "pg";
import type { Queryable } from "./types.js";

export type DeletionStatus = "pending" | "complete";

export async function createDeletionRequest(pool: Queryable, metaUserId: string): Promise<string> {
  const result = await pool.query<{ confirmation_code: string }>(
    `insert into data_deletion_requests (meta_user_id) values ($1) returning confirmation_code`,
    [metaUserId],
  );
  return result.rows[0]!.confirmation_code;
}

export async function getDeletionStatus(pool: Queryable, confirmationCode: string): Promise<DeletionStatus | null> {
  const result = await pool.query<{ status: DeletionStatus }>(
    `select status from data_deletion_requests where confirmation_code = $1`,
    [confirmationCode],
  );
  return result.rows[0]?.status ?? null;
}

export async function markDeletionComplete(pool: Pool, confirmationCode: string): Promise<void> {
  await pool.query(
    `update data_deletion_requests set status = 'complete', completed_at = now() where confirmation_code = $1`,
    [confirmationCode],
  );
}
