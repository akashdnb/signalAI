import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { randomUUID } from "node:crypto";

import { closePool, getPool } from "../../../../db/pool.js";
import { createTenant } from "../../../../db/tenants.js";
import { getExecution } from "../../../../db/journeyExecutions.js";
import type { BuilderGraph } from "../../../../db/journeyGraph.js";
import { createPublishedJourneyWithClient } from "../../../../db/journeyVersions.js";
import type { ActionDispatcher } from "../dispatcher.js";
import { JourneyActionWorker } from "../worker.js";
import { JourneyRuntime } from "../../runtime.js";
import { resetDb } from "../../../../__tests__/helpers/db.js";

const pool = getPool();

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    position: {
      x: 0,
      y: 0,
    },
    data,
    parentGroupId: null,
    collapsed: false,
  };
}

function graphWithTwoMessages(): BuilderGraph {
  return {
    version: 1,
    nodes: [
      node("trigger", "trigger"),
      node("message-1", "message", {
        text: "First message",
      }),
      node("message-2", "message", {
        text: "Second message",
      }),
    ],
    edges: [
      {
        id: "edge-trigger-message-1",
        sourceNodeId: "trigger",
        targetNodeId: "message-1",
        label: null,
        condition: null,
      },
      {
        id: "edge-message-1-message-2",
        sourceNodeId: "message-1",
        targetNodeId: "message-2",
        label: null,
        condition: null,
      },
    ],
  };
}

function terminalGraph(): BuilderGraph {
  return {
    version: 1,
    nodes: [
      node("trigger", "trigger"),
      node("message-1", "message", {
        text: "Only message",
      }),
    ],
    edges: [
      {
        id: "edge-trigger-message-1",
        sourceNodeId: "trigger",
        targetNodeId: "message-1",
        label: null,
        condition: null,
      },
    ],
  };
}

async function createCampaignWithJourney(
  graph: BuilderGraph,
): Promise<{
  tenantId: string;
  campaignId: string;
  executionSubject: string;
}> {
  const tenant = await createTenant(
    pool,
    `5e-${randomUUID()}`,
  );

  const campaignId = randomUUID();

  const executionSubject =
    `subject-${randomUUID()}`;

  await pool.query(
    `
      insert into campaigns (
        id,
        tenant_id,
        name,
        keywords,
        builder_version
      )
      values ($1, $2, $3, $4, 1)
    `,
    [
      campaignId,
      tenant.id,
      `5e-campaign-${campaignId}`,
      [],
    ],
  );

  const client = await pool.connect();

  try {
    await client.query("begin");

    await createPublishedJourneyWithClient(
      client,
      tenant.id,
      campaignId,
      graph,
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return {
    tenantId: tenant.id,
    campaignId,
    executionSubject,
  };
}

function successfulDispatcher(): ActionDispatcher {
  return {
    async dispatch() {
      return;
    },
  } as unknown as ActionDispatcher;
}

function failingDispatcher(): ActionDispatcher {
  return {
    async dispatch() {
      throw new Error("provider temporarily unavailable");
    },
  } as unknown as ActionDispatcher;
}

describe("journey action completion", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must point at a migrated test database",
      );
    }
  });

  beforeEach(async () => {
    await resetDb(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it(
    "acknowledges a successful action and advances to the next external action",
    async () => {
      const setup =
        await createCampaignWithJourney(
          graphWithTwoMessages(),
        );

      const runtime =
        new JourneyRuntime(pool);

      const started =
        await runtime.start({
          tenantId: setup.tenantId,
          campaignId: setup.campaignId,
          subjectKey: setup.executionSubject,
        });

      expect(started.action).not.toBeNull();
      expect(started.action!.type).toBe(
        "SEND_MESSAGE",
      );

      const firstActionId =
        (
          await pool.query(
            `
              select id
                from journey_actions
               where execution_id = $1
                 and action_type = 'SEND_MESSAGE'
               order by created_at asc
               limit 1
            `,
            [started.execution.id],
          )
        ).rows[0]?.id;

      expect(firstActionId).toBeTruthy();

      const worker =
        new JourneyActionWorker(
          pool,
          successfulDispatcher(),
        );

      const processed =
        await worker.processOne();

      expect(processed.claimed).toBe(true);
      expect(processed.actionId).toBe(
        firstActionId,
      );
      expect(processed.acknowledged).toBe(
        true,
      );

      const executionAfterFirst =
        await getExecution(
          pool,
          setup.tenantId,
          started.execution.id,
        );

      expect(
        executionAfterFirst,
      ).not.toBeNull();

      expect(
        executionAfterFirst!.currentNodeId,
      ).toBe("message-2");

      expect(
        executionAfterFirst!.status,
      ).toBe("waiting");

      expect(
        executionAfterFirst!.pendingAction,
      ).toMatchObject({
        type: "SEND_MESSAGE",
        nodeId: "message-2",
      });

      const actions =
        await pool.query(
          `
            select
              id,
              status
              from journey_actions
             where execution_id = $1
             order by created_at asc
          `,
          [started.execution.id],
        );

      expect(actions.rows).toHaveLength(2);
      expect(actions.rows[0].id).toBe(
        firstActionId,
      );
      expect(actions.rows[0].status).toBe(
        "acknowledged",
      );
      expect(actions.rows[1].status).toBe(
        "pending",
      );

      /*
       * Duplicate completion of the first action must be a no-op.
       */
      await runtime.completeAction(
        firstActionId!,
      );

      const actionsAfterDuplicate =
        await pool.query(
          `
            select
              id,
              status
              from journey_actions
             where execution_id = $1
             order by created_at asc
          `,
          [started.execution.id],
        );

      expect(
        actionsAfterDuplicate.rows,
      ).toHaveLength(2);

      expect(
        actionsAfterDuplicate.rows[1].status,
      ).toBe("pending");

      /*
       * Complete the second action. It is terminal, so the execution
       * must become completed with no pending action.
       */
      const secondActionId =
        actionsAfterDuplicate.rows[1].id;

      const secondProcessed =
        await worker.processOne();

      expect(
        secondProcessed.claimed,
      ).toBe(true);

      expect(
        secondProcessed.actionId,
      ).toBe(secondActionId);

      const completed =
        await getExecution(
          pool,
          setup.tenantId,
          started.execution.id,
        );

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe(
        "completed",
      );
      expect(
        completed!.currentNodeId,
      ).toBeNull();
      expect(
        completed!.pendingAction,
      ).toBeNull();

      const completedNodes =
        await pool.query(
          `
            select node_id
              from journey_node_executions
             where execution_id = $1
               and status = 'completed'
             order by completed_at asc
          `,
          [started.execution.id],
        );

      expect(
        completedNodes.rows.map(
          (row) => row.node_id,
        ),
      ).toEqual([
        "trigger",
        "message-1",
        "message-2",
      ]);
    },
  );

  it(
    "does not advance the journey when external delivery fails",
    async () => {
      const setup =
        await createCampaignWithJourney(
          graphWithTwoMessages(),
        );

      const runtime =
        new JourneyRuntime(pool);

      const started =
        await runtime.start({
          tenantId: setup.tenantId,
          campaignId: setup.campaignId,
          subjectKey: setup.executionSubject,
        });

      const actionId =
        (
          await pool.query(
            `
              select id
                from journey_actions
               where execution_id = $1
                 and status = 'pending'
               order by created_at asc
               limit 1
            `,
            [started.execution.id],
          )
        ).rows[0]?.id;

      expect(actionId).toBeTruthy();

      const worker =
        new JourneyActionWorker(
          pool,
          failingDispatcher(),
          {
            maxAttempts: 3,
            delaysSeconds: [0, 0, 0],
          },
        );

      await expect(
        worker.processOne(),
      ).rejects.toThrow(
        "provider temporarily unavailable",
      );

      const execution =
        await getExecution(
          pool,
          setup.tenantId,
          started.execution.id,
        );

      expect(execution).not.toBeNull();
      expect(execution!.status).toBe(
        "waiting",
      );
      expect(
        execution!.currentNodeId,
      ).toBe("message-1");

      const action =
        await pool.query(
          `
            select
              status,
              attempt_count,
              acknowledged_at,
              claimed_at,
              last_error
              from journey_actions
             where id = $1
          `,
          [actionId],
        );

      expect(action.rows[0].status).toBe(
        "pending",
      );
      expect(
        action.rows[0].attempt_count,
      ).toBe(1);
      expect(
        action.rows[0].acknowledged_at,
      ).toBeNull();
      expect(
        action.rows[0].claimed_at,
      ).toBeNull();
      expect(
        action.rows[0].last_error,
      ).toMatchObject({
        message:
          "provider temporarily unavailable",
      });
    },
  );

  it(
    "concurrent completion calls advance the execution only once",
    async () => {
      const setup =
        await createCampaignWithJourney(
          terminalGraph(),
        );

      const runtime =
        new JourneyRuntime(pool);

      const started =
        await runtime.start({
          tenantId: setup.tenantId,
          campaignId: setup.campaignId,
          subjectKey: setup.executionSubject,
        });

      const actionId =
        (
          await pool.query(
            `
              select id
                from journey_actions
               where execution_id = $1
               limit 1
            `,
            [started.execution.id],
          )
        ).rows[0]?.id;

      expect(actionId).toBeTruthy();

      /*
       * Simulate the worker having successfully dispatched the external
       * operation and claimed the action. Both completion calls now race
       * against the same durable state transition.
       */
      await pool.query(
        `
          update journey_actions
             set status = 'processing',
                 claimed_at = now()
           where id = $1
        `,
        [actionId],
      );

      const results =
        await Promise.all([
          runtime.completeAction(
            actionId!,
          ),
          runtime.completeAction(
            actionId!,
          ),
        ]);

      expect(results).toHaveLength(2);

      const execution =
        await getExecution(
          pool,
          setup.tenantId,
          started.execution.id,
        );

      expect(execution).not.toBeNull();
      expect(execution!.status).toBe(
        "completed",
      );
      expect(
        execution!.currentNodeId,
      ).toBeNull();

      const actions =
        await pool.query(
          `
            select
              count(*)::int as count,
              count(*) filter (
                where status = 'acknowledged'
              )::int as acknowledged
              from journey_actions
             where execution_id = $1
          `,
          [started.execution.id],
        );

      expect(
        actions.rows[0].count,
      ).toBe(1);

      expect(
        actions.rows[0].acknowledged,
      ).toBe(1);
    },
  );
});
