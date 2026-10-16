import { randomUUID } from "node:crypto";

import { getPool } from "../db/pool.js";

export type ExecutionJob = {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed";
  attempt: number;
  maxAttempts: number;
  idempotencyKey: string;
  correlationId: string;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export class ExecutionJobIdempotencyConflictError extends Error {
  constructor() {
    super("execution_job_idempotency_conflict");
    this.name = "ExecutionJobIdempotencyConflictError";
  }
}

export async function enqueueExecutionJob(input: {
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string;
  maxAttempts?: number;
}): Promise<ExecutionJob> {
  const pool = getPool();
  const correlationId = input.correlationId ?? randomUUID();
  const maxAttempts = input.maxAttempts ?? 5;

  const inserted = await pool.query(
    `
      insert into execution_jobs
        (tenant_id, type, payload, idempotency_key, correlation_id, max_attempts)
      values ($1, $2, $3::jsonb, $4, $5, $6)
      on conflict (tenant_id, idempotency_key) do nothing
      returning *
    `,
    [
      input.tenantId,
      input.type,
      JSON.stringify(input.payload),
      input.idempotencyKey,
      correlationId,
      maxAttempts,
    ],
  );

  if (inserted.rows[0]) {
    return mapExecutionJob(inserted.rows[0]);
  }

  const existing = await pool.query(
    `select * from execution_jobs where tenant_id = $1 and idempotency_key = $2`,
    [input.tenantId, input.idempotencyKey],
  );
  const row = existing.rows[0];
  if (!row) {
    throw new Error("execution_job_insert_race_lost");
  }

  const samePayload = JSON.stringify(row.payload ?? {}) === JSON.stringify(input.payload);
  if (String(row.type) !== input.type || !samePayload) {
    throw new ExecutionJobIdempotencyConflictError();
  }

  return mapExecutionJob(row);
}

export async function getExecutionJob(tenantId: string, jobId: string): Promise<ExecutionJob | null> {
  const result = await getPool().query(
    `select * from execution_jobs where tenant_id = $1 and id = $2`,
    [tenantId, jobId],
  );
  return result.rows[0] ? mapExecutionJob(result.rows[0]) : null;
}

function mapExecutionJob(row: Record<string, unknown>): ExecutionJob {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    type: String(row.type),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as ExecutionJob["status"],
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    idempotencyKey: String(row.idempotency_key),
    correlationId: String(row.correlation_id),
    availableAt: new Date(String(row.available_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    result: (row.result ?? null) as Record<string, unknown> | null,
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  };
}
