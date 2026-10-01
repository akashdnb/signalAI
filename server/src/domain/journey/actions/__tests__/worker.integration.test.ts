import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { getPool, closePool } from "../../../../db/pool.js";
import { createTenant } from "../../../../db/tenants.js";
import { createPublishedJourneyWithClient } from "../../../../db/journeyVersions.js";
import {
  createJourneyAction,
} from "../../../../db/journeyActions.js";
import {
  acknowledgeJourneyAction,
  claimNextJourneyAction,
} from "../../../../db/journeyActions.js";
import { JourneyActionWorker } from "../worker.js";
import { ActionDispatcher } from "../dispatcher.js";
import { FakeMessageSender } from "./fixtures/fakeProviders.js";

const pool = getPool();

interface Fixture {
  tenantId: string;
  campaignId: string;
  executionId: string;
  nodeExecutionId: string;
  actionId: string;
}

async function getAction(actionId: string) {
  const result = await pool.query(
    `
      select
        id,
        execution_id,
        node_execution_id,
        action_type,
        payload,
        status,
        attempt_count,
        next_attempt_at,
        last_error,
        created_at,
        acknowledged_at,
        claimed_at
      from journey_actions
      where id = $1
    `,
    [actionId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

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

async function createFixture(): Promise<Fixture> {
  const tenant = await createTenant(
    pool,
    `journey-worker-e2e-${randomUUID()}`,
  );

  const tenantId = tenant.id;
  const campaignId = randomUUID();
  const executionId = randomUUID();
  const nodeExecutionId = randomUUID();
  const actionId = randomUUID();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
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
        tenantId,
        `worker-test-${randomUUID()}`,
        [],
      ],
    );

    const graph = {
      version: 1,
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {},
          parentGroupId: null,
          collapsed: false,
        },
        {
          id: "message-1",
          type: "message",
          position: { x: 200, y: 0 },
          data: { text: "Hello" },
          parentGroupId: null,
          collapsed: false,
        },
      ],
      edges: [
        {
          id: "edge-1",
          sourceNodeId: "trigger",
          targetNodeId: "message-1",
          label: null,
          condition: null,
        },
      ],
    };

    const published = await createPublishedJourneyWithClient(
      client,
      tenantId,
      campaignId,
      graph,
    );

    await client.query(
      `
        insert into journey_executions (
          id,
          tenant_id,
          campaign_id,
          published_journey_version_id,
          published_version,
          subject_key,
          status,
          current_node_id,
          context
        )
        values (
          $1, $2, $3, $4, $5, $6,
          'waiting',
          'message-1',
          '{}'::jsonb
        )
      `,
      [
        executionId,
        tenantId,
        campaignId,
        published.id,
        published.version,
        `subject-${randomUUID()}`,
      ],
    );

    await client.query(
      `
        insert into journey_node_executions (
          id,
          execution_id,
          node_id,
          node_type,
          status
        )
        values (
          $1,
          $2,
          'message-1',
          'message',
          'waiting'
        )
      `,
      [nodeExecutionId, executionId],
    );

    const createdAction = await createJourneyAction(client, {
      executionId,
      nodeExecutionId,
      action: {
        type: "SEND_MESSAGE",
        nodeId: "message-1",
        payload: {
          text: "Hello",
        },
      },
    });

    await client.query("COMMIT");

    return {
      tenantId,
      campaignId,
      executionId,
      nodeExecutionId,
      actionId: createdAction.id,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  await pool.query(
    `
      delete from journey_actions
       where execution_id = $1
    `,
    [fixture.executionId],
  );

  await pool.query(
    `
      delete from journey_node_executions
       where execution_id = $1
    `,
    [fixture.executionId],
  );

  await pool.query(
    `
      delete from journey_executions
       where id = $1
    `,
    [fixture.executionId],
  );

  await pool.query(
    `
      delete from campaign_journey_versions
       where campaign_id = $1
         and tenant_id = $2
    `,
    [fixture.campaignId, fixture.tenantId],
  );

  await pool.query(
    `
      delete from campaigns
       where id = $1
         and tenant_id = $2
    `,
    [fixture.campaignId, fixture.tenantId],
  );

  await pool.query(
    `
      delete from tenants
       where id = $1
    `,
    [fixture.tenantId],
  );
}

describe("journey action worker integration", () => {
  const fixtures: Fixture[] = [];

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()!;
      await cleanupFixture(fixture);
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it("dispatches SEND_MESSAGE and acknowledges the action", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);

    const messageSender = new FakeMessageSender();

    const dispatcher = new ActionDispatcher([
      {
        type: "SEND_MESSAGE",
        async execute(input) {
          await messageSender.send({
            idempotencyKey: input.idempotencyKey,
            tenantId: input.execution.tenantId,
            subjectKey: input.execution.subjectKey,
            executionId: input.execution.executionId,
            actionId: input.action.id,
            payload: input.action.payload,
          });
        },
      },
    ]);

    const worker = new JourneyActionWorker(pool, dispatcher);

    const processed = await worker.processOne();

    expect(processed).toMatchObject({
      acknowledged: true,
      claimed: true,
      actionId: fixture.actionId,
    });
    expect(messageSender.requests).toHaveLength(1);

    const request = messageSender.requests[0]!;

    expect(request.idempotencyKey).toBe(fixture.actionId);
    expect(request.actionId).toBe(fixture.actionId);
    expect(request.executionId).toBe(fixture.executionId);
    expect(request.tenantId).toBe(fixture.tenantId);
    expect(request.payload).toEqual({
      text: "Hello",
    });

    const action = await getAction(fixture.actionId);

    expect(action).not.toBeNull();
    expect(action!.status).toBe("acknowledged");
    expect(action!.acknowledgedAt).not.toBeNull();
  });

  it("does not acknowledge an action when the provider fails", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);

    const messageSender = new FakeMessageSender();
    messageSender.shouldFail = true;

    const dispatcher = new ActionDispatcher([
      {
        type: "SEND_MESSAGE",
        async execute(input) {
          await messageSender.send({
            idempotencyKey: input.idempotencyKey,
            tenantId: input.execution.tenantId,
            subjectKey: input.execution.subjectKey,
            executionId: input.execution.executionId,
            actionId: input.action.id,
            payload: input.action.payload,
          });
        },
      },
    ]);

    const worker = new JourneyActionWorker(pool, dispatcher);

    await expect(worker.processOne()).rejects.toThrow(
      "fake message provider failure",
    );

    const action = await getAction(fixture.actionId);

    expect(action).not.toBeNull();
    expect(action!.status).toBe("pending");
    expect(action!.attemptCount).toBe(1);
    expect(action!.lastError).toMatchObject({
      message: "fake message provider failure",
    });
    expect(action!.nextAttemptAt).not.toBeNull();
  });

  it("uses the action id as the stable provider idempotency key", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);

    const messageSender = new FakeMessageSender();

    const dispatcher = new ActionDispatcher([
      {
        type: "SEND_MESSAGE",
        async execute(input) {
          await messageSender.send({
            idempotencyKey: input.idempotencyKey,
            tenantId: input.execution.tenantId,
            subjectKey: input.execution.subjectKey,
            executionId: input.execution.executionId,
            actionId: input.action.id,
            payload: input.action.payload,
          });
        },
      },
    ]);

    const worker = new JourneyActionWorker(pool, dispatcher);

    await worker.processOne();

    expect(messageSender.requests[0]!.idempotencyKey).toBe(
      fixture.actionId,
    );
  });
});
