import type { Pool, PoolClient } from "pg";
import type {
  BuilderGraph,
  JourneyNode,
} from "../../db/journeyGraph.js";
import {
  getLatestPublishedJourneyWithClient,
  getPublishedJourney,
  getPublishedJourneyWithClient,
  type PublishedJourney,
} from "../../db/journeyVersions.js";
import {
  createJourneyExecution,
  getActiveExecutionForSubject,
  getExecution,
  getJourneyExecutionByIdForUpdate,
  recordNodeExecution,
  updateJourneyExecution,
  type JourneyExecution,
  type JourneyPendingAction,
} from "../../db/journeyExecutions.js";
import {
  claimJourneyEvent,
} from "../../db/journeyEvents.js";
import {
  acknowledgeJourneyAction,
  createJourneyAction,
  getJourneyActionForUpdate,
} from "../../db/journeyActions.js";
import { getPool } from "../../db/pool.js";
import {
  hasJourneyTargetInteraction,
  INSTAGRAM_JOURNEY_NODE_PAYLOAD_PREFIX,
  type InstagramRichMessageOptions,
} from "../../lib/instagramMessagePayload.js";

export interface JourneyRuntimeResult {
  execution: JourneyExecution;
  action: JourneyPendingAction | null;
  duplicateEvent?: boolean;
}

export interface JourneyRuntimeInput {
  tenantId: string;
  campaignId: string;
  subjectKey: string;
  instagramAccountId?: string | null;
  context?: Record<string, unknown>;
}

export interface JourneyRuntimeEventInput {
  tenantId: string;
  executionId: string;
  eventId: string;
  eventType: string;
  instagramAccountId?: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJourneyNodeTarget(payload: Record<string, unknown> | undefined): string | null {
  const interaction = payload?.interaction;
  if (!isRecord(interaction) || typeof interaction.payload !== "string") return null;

  const interactionPayload = interaction.payload;
  if (!interactionPayload.startsWith(INSTAGRAM_JOURNEY_NODE_PAYLOAD_PREFIX)) return null;

  const nodeId = interactionPayload.slice(INSTAGRAM_JOURNEY_NODE_PAYLOAD_PREFIX.length).trim();
  return nodeId.length > 0 && nodeId.length <= 200 ? nodeId : null;
}

function nodeAwaitsInstagramInteraction(node: JourneyNode): boolean {
  if (node.type !== "message" || !isRecord(node.data.richMessage)) return false;
  return hasJourneyTargetInteraction(node.data.richMessage as InstagramRichMessageOptions);
}

async function assertJourneyAccountBinding(
  client: PoolClient,
  tenantId: string,
  campaignId: string,
  instagramAccountId: string,
): Promise<void> {
  const result = await client.query(
    `select 1
       from campaign_instagram_accounts cia
       join campaigns c on c.id = cia.campaign_id
       join meta_tokens mt on mt.id = cia.meta_token_id
      where cia.campaign_id = $1
        and c.tenant_id = $2
        and mt.tenant_id = $2
        and mt.instagram_account_id = $3
        and cia.enabled = true
      limit 1`,
    [campaignId, tenantId, instagramAccountId],
  );

  if (!result.rows[0]) {
    throw new Error(
      `Instagram account ${instagramAccountId} is not assigned to journey ${campaignId}`,
    );
  }
}

function readInstagramAccountId(
  payload: Record<string, unknown> | undefined,
): string | null {
  return typeof payload?.instagramAccountId === "string"
    ? payload.instagramAccountId
    : null;
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

      if (input.instagramAccountId) {
        await assertJourneyAccountBinding(
          client,
          input.tenantId,
          input.campaignId,
          input.instagramAccountId,
        );
      }

      const existing =
        await getActiveExecutionForSubject(
          client,
          input.tenantId,
          input.campaignId,
          input.subjectKey,
          input.instagramAccountId,
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
          input.instagramAccountId,
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

  async resumeFromEvent(
    input: JourneyRuntimeEventInput,
  ): Promise<JourneyRuntimeResult> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const execution =
        await getJourneyExecutionByIdForUpdate(
          client,
          input.executionId,
        );

      if (
        !execution ||
        execution.tenantId !== input.tenantId
      ) {
        throw new Error(
          `journey execution not found: ${input.executionId}`,
        );
      }

      const eventAccountId =
        input.instagramAccountId ??
        readInstagramAccountId(input.payload);

      if (
        eventAccountId &&
        execution.instagramAccountId !== eventAccountId
      ) {
        throw new Error(
          `Journey execution account mismatch: execution=${execution.id} executionAccount=${execution.instagramAccountId ?? "none"} eventAccount=${eventAccountId}`,
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

      let routedTargetNodeId: string | null = null;
      if (execution.status === "waiting" && execution.currentNodeId) {
        const currentNode = getNode(published.graph, execution.currentNodeId);
        if (nodeAwaitsInstagramInteraction(currentNode)) {
          const requestedTargetNodeId = readJourneyNodeTarget(input.payload);
          const allowedTarget = requestedTargetNodeId
            ? outgoingNodes(published.graph, currentNode.id).find(
                (candidate) => candidate.id === requestedTargetNodeId,
              )
            : undefined;

          if (!allowedTarget) {
            await client.query("commit");
            return {
              execution,
              action: execution.pendingAction,
              duplicateEvent: false,
            };
          }
          routedTargetNodeId = allowedTarget.id;
        }
      }

      const resumedExecution = {
        ...execution,
        currentNodeId: routedTargetNodeId ?? execution.currentNodeId,
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

  async completeAction(
    actionId: string,
  ): Promise<JourneyRuntimeResult> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const referenceResult = await client.query<{
        execution_id: string;
      }>(
        `
          select execution_id
          from journey_actions
          where id = $1
        `,
        [actionId],
      );

      const executionId =
        referenceResult.rows[0]?.execution_id;

      if (!executionId) {
        throw new Error(
          `journey action not found: ${actionId}`,
        );
      }

      const execution =
        await getJourneyExecutionByIdForUpdate(
          client,
          executionId,
        );

      if (!execution) {
        throw new Error(
          `journey execution not found: ${executionId}`,
        );
      }

      const action =
        await getJourneyActionForUpdate(
          client,
          actionId,
        );

      if (!action) {
        throw new Error(
          `journey action not found: ${actionId}`,
        );
      }

      if (action.status === "acknowledged") {
        await client.query("commit");

        return {
          execution,
          action: execution.pendingAction,
          duplicateEvent: true,
        };
      }

      if (action.status !== "processing") {
        throw new Error(
          `journey action cannot be completed from status ${action.status}: ${action.id}`,
        );
      }

      if (!execution.currentNodeId) {
        throw new Error(
          `journey execution has no current node: ${execution.id}`,
        );
      }

      if (!action.nodeExecutionId) {
        throw new Error(
          `journey action ${action.id} has no node execution`,
        );
      }

      const nodeExecutionResult = await client.query<{
        execution_id: string;
        node_id: string;
      }>(
        `
          select
            execution_id,
            node_id
          from journey_node_executions
          where id = $1
          for update
        `,
        [action.nodeExecutionId],
      );

      const linkedNodeExecution =
        nodeExecutionResult.rows[0];

      if (!linkedNodeExecution) {
        throw new Error(
          `journey node execution not found: ${action.nodeExecutionId}`,
        );
      }

      if (
        linkedNodeExecution.execution_id !== execution.id ||
        linkedNodeExecution.node_id !== execution.currentNodeId
      ) {
        throw new Error(
          `journey action ${action.id} does not match current node ${execution.currentNodeId}`,
        );
      }

      const published =
        await getPublishedJourneyWithClient(
          client,
          execution.tenantId,
          execution.campaignId,
          execution.publishedVersion,
        );

      if (!published) {
        throw new Error(
          `published journey version not found: ${execution.publishedVersion}`,
        );
      }

      const node = getNode(
        published.graph,
        execution.currentNodeId,
      );

      const next =
        outgoingNodes(
          published.graph,
          node.id,
        )[0];

      await recordNodeExecution(
        client,
        execution.id,
        node,
        "completed",
        null,
        {
          actionId: action.id,
          actionType: action.actionType,
        },
      );

      await acknowledgeJourneyAction(
        client,
        action.id,
      );

      if (nodeAwaitsInstagramInteraction(node)) {
        const waitingExecution = await updateJourneyExecution(
          client,
          execution.id,
          {
            status: "waiting",
            currentNodeId: node.id,
            context: execution.context,
            pendingAction: null,
            completed: false,
          },
        );

        await client.query("commit");
        return {
          execution: waitingExecution,
          action: null,
        };
      }

      if (!next) {
        const completedExecution =
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

        await client.query("commit");

        return {
          execution: completedExecution,
          action: null,
        };
      }

      const resumedExecution =
        await updateJourneyExecution(
          client,
          execution.id,
          {
            status: "running",
            currentNodeId: next.id,
            context: execution.context,
            pendingAction: null,
            completed: false,
          },
        );

      const result = await this.advance(
        client,
        published,
        resumedExecution,
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
