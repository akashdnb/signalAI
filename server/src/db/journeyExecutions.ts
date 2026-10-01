import type { Pool, PoolClient } from "pg";
import type { BuilderGraph } from "./journeyGraph.js";
import type { PublishedJourney } from "./journeyVersions.js";

export type JourneyExecutionStatus =
  | "running"
  | "waiting"
  | "handoff"
  | "completed"
  | "failed";

export interface JourneyPendingAction {
  type: "SEND_MESSAGE" | "HANDOFF" | "OPEN_ACTION_LINK";
  nodeId: string;
  payload: Record<string, unknown>;
}

export interface JourneyExecutionContext {
  executionId: string;
  tenantId: string;
  campaignId: string;
  subjectKey: string;
}

export interface JourneyExecution {
  id: string;
  tenantId: string;
  campaignId: string;
  publishedJourneyVersionId: string;
  publishedVersion: number;
  subjectKey: string;
  status: JourneyExecutionStatus;
  currentNodeId: string | null;
  context: Record<string, unknown>;
  pendingAction: JourneyPendingAction | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface JourneyExecutionRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  published_journey_version_id: string;
  published_version: number;
  subject_key: string;
  status: JourneyExecutionStatus;
  current_node_id: string | null;
  context: Record<string, unknown>;
  pending_action: JourneyPendingAction | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

function toExecution(row: JourneyExecutionRow): JourneyExecution {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    publishedJourneyVersionId: row.published_journey_version_id,
    publishedVersion: row.published_version,
    subjectKey: row.subject_key,
    status: row.status,
    currentNodeId: row.current_node_id,
    context: row.context,
    pendingAction: row.pending_action,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export async function getExecution(
  pool: Pool,
  tenantId: string,
  executionId: string,
): Promise<JourneyExecution | null> {
  const result = await pool.query<JourneyExecutionRow>(
    `select *
       from journey_executions
      where tenant_id = $1
        and id = $2`,
    [tenantId, executionId],
  );

  return result.rows[0] ? toExecution(result.rows[0]) : null;
}

export async function getJourneyExecutionContext(
  pool: Pool,
  executionId: string,
): Promise<JourneyExecutionContext | null> {
  const result = await pool.query<JourneyExecutionRow>(
    `select
       id,
       tenant_id,
       campaign_id,
       subject_key
       from journey_executions
      where id = $1`,
    [executionId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    executionId: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    subjectKey: row.subject_key,
  };
}

export async function getJourneyExecutionByIdForUpdate(
  client: PoolClient,
  executionId: string,
): Promise<JourneyExecution | null> {
  const result = await client.query<JourneyExecutionRow>(
    `select *
       from journey_executions
      where id = $1
      for update`,
    [executionId],
  );

  return result.rows[0]
    ? toExecution(result.rows[0])
    : null;
}

export async function getActiveExecutionForSubject(
  client: PoolClient,
  tenantId: string,
  campaignId: string,
  subjectKey: string,
): Promise<JourneyExecution | null> {
  const result = await client.query<JourneyExecutionRow>(
    `select *
       from journey_executions
      where tenant_id = $1
        and campaign_id = $2
        and subject_key = $3
        and status in ('running', 'waiting', 'handoff')
      order by updated_at desc
      limit 1
      for update`,
    [tenantId, campaignId, subjectKey],
  );

  return result.rows[0] ? toExecution(result.rows[0]) : null;
}

export async function createJourneyExecution(
  client: PoolClient,
  tenantId: string,
  campaignId: string,
  published: PublishedJourney,
  subjectKey: string,
  startNodeId: string,
): Promise<JourneyExecution> {
  const result = await client.query<JourneyExecutionRow>(
    `insert into journey_executions (
       tenant_id,
       campaign_id,
       published_journey_version_id,
       published_version,
       subject_key,
       status,
       current_node_id,
       context
     )
     values ($1, $2, $3, $4, $5, 'running', $6, '{}'::jsonb)
     returning *`,
    [
      tenantId,
      campaignId,
      published.id,
      published.version,
      subjectKey,
      startNodeId,
    ],
  );

  return toExecution(result.rows[0]!);
}

export async function updateJourneyExecution(
  client: PoolClient,
  executionId: string,
  update: {
    status: JourneyExecutionStatus;
    currentNodeId: string | null;
    context: Record<string, unknown>;
    pendingAction: JourneyPendingAction | null;
    completed: boolean;
  },
): Promise<JourneyExecution> {
  const result = await client.query<JourneyExecutionRow>(
    `update journey_executions
        set status = $2,
            current_node_id = $3,
            context = $4,
            pending_action = $5,
            updated_at = now(),
            completed_at = case
              when $6 then coalesce(completed_at, now())
              else null
            end
      where id = $1
      returning *`,
    [
      executionId,
      update.status,
      update.currentNodeId,
      update.context,
      update.pendingAction,
      update.completed,
    ],
  );

  if (!result.rows[0]) {
    throw new Error(`journey execution not found: ${executionId}`);
  }

  return toExecution(result.rows[0]);
}

export async function recordNodeExecution(
  client: PoolClient,
  executionId: string,
  node: {
    id: string;
    type: string;
  },
  status: "started" | "waiting" | "completed" | "failed",
  input: Record<string, unknown> | null,
  output: Record<string, unknown> | null,
  error: Record<string, unknown> | null = null,
): Promise<void> {
  await client.query(
    `insert into journey_node_executions (
       execution_id,
       node_id,
       node_type,
       status,
       input,
       output,
       error,
       completed_at
     )
     values ($1, $2, $3, $4, $5, $6, $7,
       case
         when $4 in ('completed', 'failed') then now()
         else null
       end
     )`,
    [
      executionId,
      node.id,
      node.type,
      status,
      input,
      output,
      error,
    ],
  );
}


export interface ActiveJourneyExecution {
  id: string;
  tenantId: string;
  campaignId: string;
  subjectKey: string;
  status: string;
  currentNodeId: string | null;
}

export async function getActiveExecutionsForSubject(
  pool: Pool,
  tenantId: string,
  subjectKey: string,
): Promise<ActiveJourneyExecution[]> {
  const result = await pool.query(
    `
      select
        id,
        tenant_id,
        campaign_id,
        subject_key,
        status,
        current_node_id
      from journey_executions
      where tenant_id = $1
        and subject_key = $2
        and status in ('running', 'waiting', 'handoff')
      order by updated_at desc
    `,
    [tenantId, subjectKey],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    campaignId: String(row.campaign_id),
    subjectKey: String(row.subject_key),
    status: String(row.status),
    currentNodeId:
      row.current_node_id == null
        ? null
        : String(row.current_node_id),
  }));
}
