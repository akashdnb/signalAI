import type { PoolClient } from "pg";
import type { JourneyPendingAction } from "./journeyExecutions.js";

export type JourneyActionStatus =
  | "pending"
  | "processing"
  | "acknowledged"
  | "failed";

export interface JourneyAction {
  id: string;
  executionId: string;
  nodeExecutionId: string | null;
  actionType: JourneyPendingAction["type"];
  payload: Record<string, unknown>;
  status: JourneyActionStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError: Record<string, unknown> | null;
  createdAt: string;
  acknowledgedAt: string | null;
  claimedAt: string | null;
}

interface JourneyActionRow {
  id: string;
  execution_id: string;
  node_execution_id: string | null;
  action_type: JourneyPendingAction["type"];
  payload: Record<string, unknown>;
  status: JourneyActionStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: Record<string, unknown> | null;
  created_at: string;
  acknowledged_at: string | null;
  claimed_at: string | null;
}

function toJourneyAction(row: JourneyActionRow): JourneyAction {
  return {
    id: row.id,
    executionId: row.execution_id,
    nodeExecutionId: row.node_execution_id,
    actionType: row.action_type,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    claimedAt: row.claimed_at,
  };
}

export async function createJourneyAction(
  client: PoolClient,
  input: {
    executionId: string;
    nodeExecutionId: string;
    action: JourneyPendingAction;
  },
): Promise<JourneyAction> {
  const result = await client.query<JourneyActionRow>(
    `insert into journey_actions (
       execution_id,
       node_execution_id,
       action_type,
       payload
     )
     values ($1, $2, $3, $4)
     on conflict (
       execution_id,
       node_execution_id,
       action_type
     )
     do update set payload = journey_actions.payload
     returning *`,
    [
      input.executionId,
      input.nodeExecutionId,
      input.action.type,
      input.action.payload,
    ],
  );

  return toJourneyAction(result.rows[0]!);
}

export async function getJourneyActionForUpdate(
  client: PoolClient,
  actionId: string,
): Promise<JourneyAction | null> {
  const result = await client.query<JourneyActionRow>(
    `select *
       from journey_actions
      where id = $1
      for update`,
    [actionId],
  );

  return result.rows[0]
    ? toJourneyAction(result.rows[0])
    : null;
}

export async function getPendingJourneyAction(
  client: PoolClient,
  executionId: string,
): Promise<JourneyAction | null> {
  const result = await client.query<JourneyActionRow>(
    `select *
       from journey_actions
      where execution_id = $1
        and status = 'pending'
      order by created_at asc
      limit 1
      for update`,
    [executionId],
  );

  return result.rows[0]
    ? toJourneyAction(result.rows[0])
    : null;
}

export async function consumeJourneyAction(
  client: PoolClient,
  actionId: string,
): Promise<JourneyAction | null> {
  const result = await client.query<JourneyActionRow>(
    `update journey_actions
        set status = 'acknowledged',
            acknowledged_at = coalesce(acknowledged_at, now()),
            claimed_at = null
      where id = $1
        and status = 'pending'
      returning *`,
    [actionId],
  );

  return result.rows[0]
    ? toJourneyAction(result.rows[0])
    : null;
}

export async function acknowledgeJourneyAction(
  client: PoolClient,
  actionId: string,
): Promise<JourneyAction> {
  const result = await client.query<JourneyActionRow>(
    `update journey_actions
        set status = 'acknowledged',
            acknowledged_at = coalesce(acknowledged_at, now()),
            claimed_at = null
      where id = $1
        and status = 'processing'
      returning *`,
    [actionId],
  );

  if (!result.rows[0]) {
    throw new Error(`journey action is not processing: ${actionId}`);
  }

  return toJourneyAction(result.rows[0]);
}


export async function retryJourneyAction(
  client: PoolClient,
  actionId: string,
  nextAttemptAt: Date,
  error: Record<string, unknown>,
): Promise<JourneyAction> {
  const result = await client.query<JourneyActionRow>(
    `update journey_actions
        set status = 'pending',
            attempt_count = attempt_count + 1,
            next_attempt_at = $2,
            last_error = $3,
            claimed_at = null
      where id = $1
        and status = 'processing'
      returning *`,
    [actionId, nextAttemptAt, error],
  );

  if (!result.rows[0]) {
    throw new Error(`journey action is not processing: ${actionId}`);
  }

  return toJourneyAction(result.rows[0]);
}

export async function failJourneyAction(
  client: PoolClient,
  actionId: string,
  error: Record<string, unknown>,
): Promise<JourneyAction> {
  const result = await client.query<JourneyActionRow>(
    `update journey_actions
        set status = 'failed',
            attempt_count = attempt_count + 1,
            next_attempt_at = null,
            last_error = $2,
            claimed_at = null
      where id = $1
        and status = 'processing'
      returning *`,
    [actionId, error],
  );

  if (!result.rows[0]) {
    throw new Error(`journey action is not processing: ${actionId}`);
  }

  return toJourneyAction(result.rows[0]);
}

export async function claimNextJourneyAction(
  client: PoolClient,
  leaseSeconds = 60,
): Promise<JourneyAction | null> {
  const result = await client.query<JourneyActionRow>(
    `with candidate as (
       select id
         from journey_actions
        where (
          status = 'pending'
          and (
            next_attempt_at is null
            or next_attempt_at <= now()
          )
        )
           or (
             status = 'processing'
             and claimed_at < now() - ($1::int * interval '1 second')
           )
        order by created_at asc
        for update skip locked
        limit 1
     )
     update journey_actions
        set status = 'processing',
            claimed_at = now()
       where id = (select id from candidate)
     returning *`,
    [leaseSeconds],
  );

  return result.rows[0]
    ? toJourneyAction(result.rows[0])
    : null;
}
