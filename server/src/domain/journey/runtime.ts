import type { Pool, PoolClient } from "pg";
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
import {
  claimJourneyEvent,
} from "../../db/journeyEvents.js";
import {
  consumeJourneyAction,
  createJourneyAction,
  getPendingJourneyAction,
} from "../../db/journeyActions.js";
import { getPool } from "../../db/pool.js";

export interface JourneyRuntimeResult {
  execution: JourneyExecution;
  action: JourneyPendingAction | null;
  duplicateEvent?: boolean;
}

export interface JourneyRuntimeInput {
  tenantId: string;
  campaignId: string;
  subjectKey: string;
  context?: Record<string, unknown>;
}

export interface JourneyRuntimeEventInput {
  tenantId: string;
  executionId: string;
  eventId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

function outgoingNodes(
  graph: BuilderGraph,
  nodeId: string,
): JourneyNode[] {
  const targetIds = graph.edges
    .filter((edge) => edge.sourceNodeId === nodeId)
    .map((edge) => edge.targetNodeId);

  return targetIds
    .map((targetId) =>
      graph.nodes.find((node) => node.id === targetId),
    )
    .filter((node): node is JourneyNode => Boolean(node));
}

function getNode(
  graph: BuilderGraph,
  nodeId: string | null,
): JourneyNode {
  if (!nodeId) {
    throw new Error("journey execution has no current node");
  }

  const node = graph.nodes.find(
    (candidate) => candidate.id === nodeId,
  );

  if (!node) {
    throw new Error(`journey node not found: ${nodeId}`);
  }

  return node;
}

function buildAction(
  node: JourneyNode,
): JourneyPendingAction {
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
      throw new Error(
        `node ${node.id} does not produce an external action`,
      );
  }
}

function mergeContext(
  current: Record<string, unknown>,
  additional?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...current,
    ...(additional ?? {}),
  };
}

/**
 * IMPORTANT:
 *
 * Runtime transactions use PostgreSQL row locks and unique constraints
 * as the source of truth.
 *
 * Never implement:
 *
 *   SELECT -> if missing -> INSERT
 *
 * without a database constraint protecting the INSERT.
 */
export class JourneyRuntime {
  constructor(
    private readonly pool: Pool = getPool(),
  ) {}

  async start(
    input: JourneyRuntimeInput,
  ): Promise<JourneyRuntimeResult> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const published =
        await getLatestPublishedJourneyWithClient(
          client,
          input.tenantId,
          input.campaignId,
        );

      if (!published) {
        throw new Error(
          "campaign has no published journey",
        );
      }

      const trigger = published.graph.nodes.find(
        (node) => node.type === "trigger",
      );

      if (!trigger) {
        throw new Error(
          "published journey has no trigger",
        );
      }

      const existing =
        await getActiveExecutionForSubject(
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

      let execution: JourneyExecution;

      try {
        execution = await createJourneyExecution(
          client,
          input.tenantId,
          input.campaignId,
          published,
          input.subjectKey,
          trigger.id,
        );
      } catch (error) {
        /*
         * Two concurrent starts can both observe no active row.
         *
         * The partial unique index prevents both inserts.
         *
         * If this transaction loses the race, PostgreSQL aborts the
         * transaction on the unique violation, so rollback and retry
         * the lookup in a fresh transaction.
         */
        if (
          isUniqueViolation(
            error,
            "journey_executions_active_subject_unique",
          )
        ) {
          await client.query("rollback");

          return this.start(input);
        }

        throw error;
      }

      const updated = await this.advance(
        client,
        published,
        execution,
        input.context,
      );

      await client.query("commit");

      return updated;
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process an external event exactly once.
   *
   * The event id is claimed inside the same transaction that mutates
   * the journey execution.
   */
  async resumeFromEvent(
    input: JourneyRuntimeEventInput,
  ): Promise<JourneyRuntimeResult> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const execution = await getExecutionForUpdate(
        client,
        input.tenantId,
        input.executionId,
      );

      if (!execution) {
        throw new Error(
          `journey execution not found: ${input.executionId}`,
        );
      }

      const event = await claimJourneyEvent(
        client,
        {
          tenantId: input.tenantId,
          executionId: input.executionId,
          eventId: input.eventId,
          eventType: input.eventType,
          payload: input.payload ?? {},
        },
      );

      if (!event) {
        /*
         * Event was already processed.
         *
         * Because the event claim and execution mutation happen in
         * the same transaction, this is safe under concurrent delivery.
         */
        const current = await getExecution(
          this.pool,
          input.tenantId,
          input.executionId,
        );

        if (!current) {
          throw new Error(
            `journey execution not found: ${input.executionId}`,
          );
        }

        await client.query("commit");

        return {
          execution: current,
          action: current.pendingAction,
          duplicateEvent: true,
        };
      }

      const pendingAction =
        await getPendingJourneyAction(
          client,
          input.executionId,
        );

      if (pendingAction) {
        const consumedAction = await consumeJourneyAction(
          client,
          pendingAction.id,
        );

        if (!consumedAction) {
          throw new Error(
            `journey action could not be consumed: ${pendingAction.id}`,
          );
        }
      }

      /*
       * Clear the legacy pending_action field while advancing.
       * journey_actions is now the durable source of action state.
       */
      const context = mergeContext(
        execution.context,
        input.payload,
      );

      const published =
        await getPublishedJourney(
          this.pool,
          input.tenantId,
          execution.campaignId,
          execution.publishedVersion,
        );

      if (!published) {
        throw new Error(
          `published journey version not found: ${execution.publishedVersion}`,
        );
      }

      const resumedExecution = {
        ...execution,
        pendingAction: null,
        status: "running" as const,
      };

      const result = await this.advance(
        client,
        published,
        resumedExecution,
        context,
      );

      await client.query("commit");

      return result;
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /*
   * Backward-compatible wrapper for the existing runtime API.
   *
   * New integrations should use resumeFromEvent().
   */
  async resume(
    tenantId: string,
    executionId: string,
    context?: Record<string, unknown>,
  ): Promise<JourneyRuntimeResult> {
    return this.resumeFromEvent({
      tenantId,
      executionId,
      eventId: `legacy-resume:${executionId}:${Date.now()}`,
      eventType: "LEGACY_RESUME",
      payload: context,
    });
  }

  private async advance(
    client: PoolClient,
    published: PublishedJourney,
    initialExecution: JourneyExecution,
    additionalContext?: Record<string, unknown>,
  ): Promise<JourneyRuntimeResult> {
    let execution = {
      ...initialExecution,
      context: mergeContext(
        initialExecution.context,
        additionalContext,
      ),
    };

    let steps = 0;

    while (steps++ < 100) {
      const node = getNode(
        published.graph,
        execution.currentNodeId,
      );

      await recordNodeExecution(
        client,
        execution.id,
        node,
        "started",
        {
          context: execution.context,
        },
        null,
      );

      switch (node.type) {
        case "trigger": {
          const next = outgoingNodes(
            published.graph,
            node.id,
          );

          await recordNodeExecution(
            client,
            execution.id,
            node,
            "completed",
            null,
            {
              nextNodeId: next[0]?.id ?? null,
            },
          );

          if (!next[0]) {
            execution =
              await updateJourneyExecution(
                client,
                execution.id,
                {
                  status: "completed",
                  currentNodeId: null,
                  context: execution.context,
                  pendingAction: null,
                  completed: true,
                },
              );

            return {
              execution,
              action: null,
            };
          }

          execution =
            await updateJourneyExecution(
              client,
              execution.id,
              {
                status: "running",
                currentNodeId: next[0].id,
                context: execution.context,
                pendingAction: null,
                completed: false,
              },
            );

          continue;
        }

        case "milestone_group": {
          const milestoneId =
            typeof node.data.milestoneId === "string"
              ? node.data.milestoneId
              : null;

          const completedMilestones =
            Array.isArray(
              execution.context.completedMilestones,
            )
              ? execution.context.completedMilestones
              : [];

          const nextCompleted =
            milestoneId &&
            !completedMilestones.includes(milestoneId)
              ? [
                  ...completedMilestones,
                  milestoneId,
                ]
              : completedMilestones;

          const next =
            outgoingNodes(
              published.graph,
              node.id,
            )[0];

          const context = {
            ...execution.context,
            completedMilestones:
              nextCompleted,
          };

          await recordNodeExecution(
            client,
            execution.id,
            node,
            "completed",
            null,
            {
              milestoneId,
              completedMilestones:
                nextCompleted,
            },
          );

          if (!next) {
            execution =
              await updateJourneyExecution(
                client,
                execution.id,
                {
                  status: "completed",
                  currentNodeId: null,
                  context,
                  pendingAction: null,
                  completed: true,
                },
              );

            return {
              execution,
              action: null,
            };
          }

          execution =
            await updateJourneyExecution(
              client,
              execution.id,
              {
                status: "running",
                currentNodeId: next.id,
                context,
                pendingAction: null,
                completed: false,
              },
            );

          continue;
        }

        case "message":
        case "action_link":
        case "human_handoff": {
          const action = buildAction(node);

          const nodeExecutionResult =
            await client.query<{ id: string }>(
              `select id
                 from journey_node_executions
                where execution_id = $1
                  and node_id = $2
                order by started_at desc
                limit 1`,
              [execution.id, node.id],
            );

          const nodeExecutionId =
            nodeExecutionResult.rows[0]?.id;

          if (!nodeExecutionId) {
            throw new Error(
              `node execution was not created: ${node.id}`,
            );
          }

          await recordNodeExecution(
            client,
            execution.id,
            node,
            "waiting",
            null,
            action.payload,
          );

          await createJourneyAction(
            client,
            {
              executionId: execution.id,
              nodeExecutionId,
              action,
            },
          );

          const status =
            node.type === "human_handoff"
              ? "handoff"
              : "waiting";

          execution =
            await updateJourneyExecution(
              client,
              execution.id,
              {
                status,
                currentNodeId: node.id,
                context: execution.context,
                pendingAction: action,
                completed: false,
              },
            );

          return {
            execution,
            action,
          };
        }

        default:
          throw new Error(
            `unsupported runtime node type: ${node.type}`,
          );
      }
    }

    throw new Error(
      "journey runtime exceeded 100 traversal steps",
    );
  }
}

async function getExecutionForUpdate(
  client: PoolClient,
  tenantId: string,
  executionId: string,
): Promise<JourneyExecution | null> {
  const result = await client.query<any>(
    `select *
       from journey_executions
      where tenant_id = $1
        and id = $2
      for update`,
    [tenantId, executionId],
  );

  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];

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

function isUniqueViolation(
  error: unknown,
  constraint: string,
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    constraint?: string;
  };

  return (
    candidate.code === "23505" &&
    candidate.constraint === constraint
  );
}

async function safeRollback(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // Ignore rollback errors because the original error is more useful.
  }
}
