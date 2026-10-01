import type { PoolClient } from "pg";
import type { JourneyPendingAction } from "./journeyExecutions.js";

export type JourneyActionStatus =
  | "pending"
  | "acknowledged";

export interface JourneyAction {
  id: string;
  executionId: string;
  nodeExecutionId: string | null;
  actionType: JourneyPendingAction["type"];
  payload: Record<string, unknown>;
  status: JourneyActionStatus;
  createdAt: string;
  acknowledgedAt: string | null;
}

interface JourneyActionRow {
  id: string;
  execution_id: string;
  node_execution_id: string | null;
  action_type: JourneyPendingAction["type"];
  payload: Record<string, unknown>;
  status: JourneyActionStatus;
  created_at: string;
  acknowledged_at: string | null;
}

function toJourneyAction(row: JourneyActionRow): JourneyAction {
  return {
    id: row.id,
    executionId: row.execution_id,
    nodeExecutionId: row.node_execution_id,
    actionType: row.action_type,
    payload: row.payload,
    status: row.status,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
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

export async function acknowledgeJourneyAction(
  client: PoolClient,
  actionId: string,
): Promise<JourneyAction> {
  const result = await client.query<JourneyActionRow>(
    `update journey_actions
        set status = 'acknowledged',
            acknowledged_at = coalesce(acknowledged_at, now())
      where id = $1
        and status = 'pending'
      returning *`,
    [actionId],
  );

  if (!result.rows[0]) {
    throw new Error(`journey action is already acknowledged: ${actionId}`);
  }

  return toJourneyAction(result.rows[0]);
}
