import type { Pool } from "pg";
import type {
  BuilderGraph,
  JourneyNode,
} from "../../db/journeyGraph.js";
import {
  getLatestPublishedJourneyWithClient,
  getPublishedJourney,
  type PublishedJourney,
} from "../../db/journeyVersions.js";
import {
  createJourneyExecution,
  getActiveExecutionForSubject,
  getExecution,
  recordNodeExecution,
  updateJourneyExecution,
  type JourneyExecution,
  type JourneyPendingAction,
} from "../../db/journeyExecutions.js";
import { getPool } from "../../db/pool.js";

export interface JourneyRuntimeResult {
  execution: JourneyExecution;
  action: JourneyPendingAction | null;
}

export interface JourneyRuntimeInput {
  tenantId: string;
  campaignId: string;
  subjectKey: string;
  context?: Record<string, unknown>;
}

function outgoingNodes(
  graph: BuilderGraph,
  nodeId: string,
): JourneyNode[] {
  const targetIds = graph.edges
    .filter((edge) => edge.sourceNodeId === nodeId)
    .map((edge) => edge.targetNodeId);

  return targetIds
    .map((targetId) => graph.nodes.find((node) => node.id === targetId))
    .filter((node): node is JourneyNode => Boolean(node));
}

function getNode(
  graph: BuilderGraph,
  nodeId: string | null,
): JourneyNode {
  if (!nodeId) {
    throw new Error("journey execution has no current node");
  }

  const node = graph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`journey node not found: ${nodeId}`);
  }

  return node;
}

function buildAction(node: JourneyNode): JourneyPendingAction {
  switch (node.type) {
    case "message":
      return {
        type: "SEND_MESSAGE",
        nodeId: node.id,
        payload: {
          data: node.data,
        },
      };

    case "action_link":
      return {
        type: "OPEN_ACTION_LINK",
        nodeId: node.id,
        payload: {
          data: node.data,
        },
      };

    case "human_handoff":
      return {
        type: "HANDOFF",
        nodeId: node.id,
        payload: {
          data: node.data,
        },
      };

    default:
      throw new Error(`node ${node.id} does not produce an external action`);
  }
}

function mergeContext(
  current: Record<string, unknown>,
  additional: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...current,
    ...(additional ?? {}),
  };
}

/**
 * Runtime contract:
 *
 * - always loads an immutable published snapshot
 * - never reads journey_nodes/journey_edges directly
 * - execution is pinned to one published version
 * - deterministic nodes advance automatically
 * - external-action nodes pause with pending_action
 */
export class JourneyRuntime {
  constructor(
    private readonly pool: Pool = getPool(),
  ) {}

  async start(input: JourneyRuntimeInput): Promise<JourneyRuntimeResult> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const published = await getLatestPublishedJourneyWithClient(
        client,
        input.tenantId,
        input.campaignId,
      );

      if (!published) {
        await client.query("rollback");
        throw new Error("campaign has no published journey");
      }

      const trigger = published.graph.nodes.find(
        (node) => node.type === "trigger",
      );

      if (!trigger) {
        await client.query("rollback");
        throw new Error("published journey has no trigger");
      }

      const existing = await getActiveExecutionForSubject(
        client,
        input.tenantId,
        input.campaignId,
        input.subjectKey,
      );

      if (existing) {
        await client.query("commit");
        return {
          execution: existing,
          action: existing.pendingAction,
        };
      }

      const execution = await createJourneyExecution(
        client,
        input.tenantId,
        input.campaignId,
        published,
        input.subjectKey,
        trigger.id,
      );

      const updated = await this.advance(
        client,
        published,
        execution,
        input.context,
      );

      await client.query("commit");

      return updated;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async resume(
    tenantId: string,
    executionId: string,
    context?: Record<string, unknown>,
  ): Promise<JourneyRuntimeResult> {
    const existing = await getExecution(
      this.pool,
      tenantId,
      executionId,
    );

    if (!existing) {
      throw new Error("journey execution not found");
    }

    /*
     * Important:
     * We reload the exact immutable version the execution started with.
     * A newer publication must never mutate an existing execution.
     */
    const published = await getPublishedJourney(
      this.pool,
      tenantId,
      existing.campaignId,
      existing.publishedVersion,
    );

    if (!published) {
      throw new Error(
        `published journey version ${existing.publishedVersion} not found`,
      );
    }

    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const locked = await getExecutionForUpdate(
        client,
        tenantId,
        executionId,
      );

      if (!locked) {
        await client.query("rollback");
        throw new Error("journey execution not found");
      }

      /*
       * If an external worker retries the same event, do not execute a
       * completed/handoff execution again.
       */
      if (
        locked.status === "completed" ||
        locked.status === "failed"
      ) {
        await client.query("commit");

        return {
          execution: locked,
          action: locked.pendingAction,
        };
      }

      const updated = await this.advance(
        client,
        published,
        locked,
        context,
      );

      await client.query("commit");

      return updated;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async advance(
    client: import("pg").PoolClient,
    published: PublishedJourney,
    execution: JourneyExecution,
    additionalContext?: Record<string, unknown>,
  ): Promise<JourneyRuntimeResult> {
    let current = execution;
    let context = mergeContext(
      current.context,
      additionalContext,
    );

    /*
     * Safety limit prevents a malformed future graph from looping forever.
     * The publish validator already rejects cycles, but the runtime keeps
     * its own defensive bound.
     */
    for (let step = 0; step < 100; step += 1) {
      const node = getNode(
        published.graph,
        current.currentNodeId,
      );

      if (node.type === "trigger") {
        await recordNodeExecution(
          client,
          current.id,
          node,
          "completed",
          null,
          { type: "TRIGGER" },
        );

        const next = outgoingNodes(
          published.graph,
          node.id,
        );

        if (next.length === 0) {
          current = await updateJourneyExecution(
            client,
            current.id,
            {
              status: "completed",
              currentNodeId: node.id,
              context,
              pendingAction: null,
              completed: true,
            },
          );

          return { execution: current, action: null };
        }

        if (next.length > 1) {
          throw new Error(
            `node ${node.id} has multiple outgoing edges; branching runtime is not implemented`,
          );
        }

        current = await updateJourneyExecution(
          client,
          current.id,
          {
            status: "running",
            currentNodeId: next[0]!.id,
            context,
            pendingAction: null,
            completed: false,
          },
        );

        continue;
      }

      if (node.type === "milestone_group") {
        const milestoneId =
          typeof node.data.milestoneId === "string"
            ? node.data.milestoneId
            : null;

        await recordNodeExecution(
          client,
          current.id,
          node,
          "completed",
          null,
          {
            type: "MILESTONE_COMPLETED",
            milestoneId,
          },
        );

        context = {
          ...context,
          completedMilestones: [
            ...(
              Array.isArray(context.completedMilestones)
                ? context.completedMilestones
                : []
            ),
            ...(milestoneId ? [milestoneId] : []),
          ],
        };

        const next = outgoingNodes(
          published.graph,
          node.id,
        );

        if (next.length === 0) {
          current = await updateJourneyExecution(
            client,
            current.id,
            {
              status: "completed",
              currentNodeId: node.id,
              context,
              pendingAction: null,
              completed: true,
            },
          );

          return { execution: current, action: null };
        }

        if (next.length > 1) {
          throw new Error(
            `node ${node.id} has multiple outgoing edges; branching runtime is not implemented`,
          );
        }

        current = await updateJourneyExecution(
          client,
          current.id,
          {
            status: "running",
            currentNodeId: next[0]!.id,
            context,
            pendingAction: null,
            completed: false,
          },
        );

        continue;
      }

      if (
        node.type === "message" ||
        node.type === "action_link" ||
        node.type === "human_handoff"
      ) {
        const action = buildAction(node);

        await recordNodeExecution(
          client,
          current.id,
          node,
          "waiting",
          context,
          {
            action,
          },
        );

        const status =
          node.type === "human_handoff"
            ? "handoff"
            : "waiting";

        current = await updateJourneyExecution(
          client,
          current.id,
          {
            status,
            currentNodeId: node.id,
            context,
            pendingAction: action,
            completed: false,
          },
        );

        return {
          execution: current,
          action,
        };
      }

      throw new Error(
        `unsupported runtime node type: ${node.type}`,
      );
    }

    throw new Error(
      "journey runtime exceeded maximum traversal depth",
    );
  }
}

async function getExecutionForUpdate(
  client: import("pg").PoolClient,
  tenantId: string,
  executionId: string,
): Promise<JourneyExecution | null> {
  const result = await client.query<{
    id: string;
    tenant_id: string;
    campaign_id: string;
    published_journey_version_id: string;
    published_version: number;
    subject_key: string;
    status: JourneyExecution["status"];
    current_node_id: string | null;
    context: Record<string, unknown>;
    pending_action: JourneyPendingAction | null;
    started_at: string;
    updated_at: string;
    completed_at: string | null;
  }>(
    `select *
       from journey_executions
      where tenant_id = $1
        and id = $2
      for update`,
    [tenantId, executionId],
  );

  const row = result.rows[0];

  if (!row) return null;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    publishedJourneyVersionId:
      row.published_journey_version_id,
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
