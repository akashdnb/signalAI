import type { Pool } from "pg";

export async function recordDeadLetterEvent(
  pool: Pool,
  params: { queueName: string; sourceJobId: string; jobData: unknown; failureOutput: unknown },
): Promise<void> {
  await pool.query(
    `insert into dead_letter_events (queue_name, source_job_id, job_data, failure_output)
     values ($1, $2, $3, $4)`,
    [
      params.queueName,
      params.sourceJobId,
      JSON.stringify(params.jobData),
      params.failureOutput ? JSON.stringify(params.failureOutput) : null,
    ],
  );
}
