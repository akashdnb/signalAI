import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import {
  claimNextJourneyAction,
  createJourneyAction,
  getPendingJourneyAction,
  retryJourneyAction,
  failJourneyAction,
} from "../../../../db/journeyActions.js";
import { getPool, closePool } from "../../../../db/pool.js";
import {
  createPublishedJourneyWithClient,
} from "../../../../db/journeyVersions.js";
import { createTenant } from "../../../../db/tenants.js";
import type { BuilderGraph } from "../../../../db/journeyGraph.js";

const pool = getPool();

function makeGraph(): BuilderGraph {
  return {
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
        data: {
          text: "Hello",
        },
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
}

async function createFixture() {
  const tenant = await createTenant(
    pool,
    `journey-retry-test-${randomUUID()}`,
  );

  const campaignId = randomUUID();

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
      `retry-test-${campaignId}`,
      [],
    ],
  );

  const publishClient = await pool.connect();

  let published;

  try {
    await publishClient.query("begin");

    published = await createPublishedJourneyWithClient(
      publishClient,
      tenant.id,
      campaignId,
      makeGraph(),
    );

    await publishClient.query("commit");
  } catch (error) {
    await publishClient.query("rollback");
    throw error;
  } finally {
    publishClient.release();
  }

  const execution = await pool.query<{ id: string }>(
    `
      insert into journey_executions (
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
        $1,
        $2,
        $3,
        $4,
        $5,
        'waiting',
        'message-1',
        '{}'::jsonb
      )
      returning id
    `,
    [
      tenant.id,
      campaignId,
      published.id,
      published.version,
      `subject-${randomUUID()}`,
    ],
  );

  const executionId = execution.rows[0]!.id;

  const client = await pool.connect();

  let action;

  try {
    await client.query("begin");

    const nodeExecution = await client.query<{ id: string }>(
      `
        insert into journey_node_executions (
          execution_id,
          node_id,
          node_type,
          status
        )
        values ($1, 'message-1', 'message', 'waiting')
        returning id
      `,
      [executionId],
    );

    action = await createJourneyAction(client, {
      executionId,
      nodeExecutionId: nodeExecution.rows[0]!.id,
      action: {
        type: "SEND_MESSAGE",
        nodeId: "message-1",
        payload: {
          text: "Hello",
        },
      },
    });

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
    executionId,
    actionId: action.id,
  };
}

async function cleanup(tenantId: string) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(
      `
        delete from journey_actions
         where execution_id in (
           select id
             from journey_executions
            where tenant_id = $1
         )
      `,
      [tenantId],
    );

    await client.query(
      `
        delete from journey_node_executions
         where execution_id in (
           select id
             from journey_executions
            where tenant_id = $1
         )
      `,
      [tenantId],
    );

    await client.query(
      `
        delete from journey_executions
         where tenant_id = $1
      `,
      [tenantId],
    );

    await client.query(
      `
        delete from campaign_journey_versions
         where tenant_id = $1
      `,
      [tenantId],
    );

    await client.query(
      `
        delete from campaigns
         where tenant_id = $1
      `,
      [tenantId],
    );

    await client.query(
      `
        delete from tenants
         where id = $1
      `,
      [tenantId],
    );

    await client.query("commit");
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Ignore rollback failure during cleanup.
    }

    throw error;
  } finally {
    client.release();
  }
}


describe("journey action retries", () => {
  afterAll(async () => {
    await closePool();
  });

  it("persists retry state with a due retry time", async () => {
    const fixture = await createFixture();

    try {
      /*
       * retryJourneyAction requires processing state.
       * We update this specific fixture directly rather than using the
       * global worker queue, because claimNextJourneyAction() intentionally
       * operates across all tenants.
       */
      await pool.query(
        `
          update journey_actions
             set status = 'processing',
                 claimed_at = now()
           where id = $1
        `,
        [fixture.actionId],
      );

      const retryAt = new Date(Date.now() - 1000);

      const client = await pool.connect();

      try {
        await client.query("begin");

        const retried = await retryJourneyAction(
          client,
          fixture.actionId,
          retryAt,
          {
            name: "Error",
            message: "provider unavailable",
          },
        );

        expect(retried.status).toBe("pending");
        expect(retried.attemptCount).toBe(1);
        expect(retried.nextAttemptAt).not.toBeNull();
        expect(retried.lastError).toEqual({
          name: "Error",
          message: "provider unavailable",
        });
        expect(retried.claimedAt).toBeNull();

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }

      const result = await pool.query<{
        status: string;
        attempt_count: number;
        next_attempt_at: string | null;
        last_error: Record<string, unknown> | null;
        claimed_at: string | null;
      }>(
        `
          select
            status,
            attempt_count,
            next_attempt_at,
            last_error,
            claimed_at
          from journey_actions
          where id = $1
        `,
        [fixture.actionId],
      );

      expect(result.rows[0]).toEqual(
        expect.objectContaining({
          status: "pending",
          attempt_count: 1,
          last_error: {
            name: "Error",
            message: "provider unavailable",
          },
          claimed_at: null,
        }),
      );

      expect(result.rows[0]!.next_attempt_at).not.toBeNull();
    } finally {
      await cleanup(fixture.tenantId);
    }
  });

  it("persists a future retry time", async () => {
    const fixture = await createFixture();

    try {
      await pool.query(
        `
          update journey_actions
             set status = 'processing',
                 claimed_at = now()
           where id = $1
        `,
        [fixture.actionId],
      );

      const retryAt = new Date(Date.now() + 60_000);

      const client = await pool.connect();

      try {
        await client.query("begin");

        const retried = await retryJourneyAction(
          client,
          fixture.actionId,
          retryAt,
          {
            name: "Error",
            message: "temporary failure",
          },
        );

        expect(retried.status).toBe("pending");
        expect(retried.attemptCount).toBe(1);
        expect(retried.nextAttemptAt).not.toBeNull();

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }

      const result = await pool.query<{
        status: string;
        attempt_count: number;
        next_attempt_at: string | null;
      }>(
        `
          select status, attempt_count, next_attempt_at
            from journey_actions
           where id = $1
        `,
        [fixture.actionId],
      );

      expect(result.rows[0]?.status).toBe("pending");
      expect(result.rows[0]?.attempt_count).toBe(1);
      expect(result.rows[0]?.next_attempt_at).not.toBeNull();

      const persistedRetryAt = new Date(
        result.rows[0]!.next_attempt_at!,
      ).getTime();

      expect(persistedRetryAt).toBeGreaterThan(Date.now());
    } finally {
      await cleanup(fixture.tenantId);
    }
  });

  it("marks an action failed at the terminal attempt", async () => {
    const fixture = await createFixture();

    try {
      await pool.query(
        `
          update journey_actions
             set status = 'processing',
                 attempt_count = 4,
                 claimed_at = now()
           where id = $1
        `,
        [fixture.actionId],
      );

      const client = await pool.connect();

      try {
        await client.query("begin");

        const failed = await failJourneyAction(
          client,
          fixture.actionId,
          {
            name: "Error",
            message: "permanent failure",
          },
        );

        expect(failed.status).toBe("failed");
        expect(failed.attemptCount).toBe(5);
        expect(failed.nextAttemptAt).toBeNull();
        expect(failed.lastError).toEqual({
          name: "Error",
          message: "permanent failure",
        });
        expect(failed.claimedAt).toBeNull();

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }

      const result = await pool.query<{
        status: string;
        attempt_count: number;
        next_attempt_at: string | null;
        last_error: Record<string, unknown> | null;
        claimed_at: string | null;
      }>(
        `
          select
            status,
            attempt_count,
            next_attempt_at,
            last_error,
            claimed_at
          from journey_actions
          where id = $1
        `,
        [fixture.actionId],
      );

      expect(result.rows[0]).toEqual(
        expect.objectContaining({
          status: "failed",
          attempt_count: 5,
          next_attempt_at: null,
          last_error: {
            name: "Error",
            message: "permanent failure",
          },
          claimed_at: null,
        }),
      );
    } finally {
      await cleanup(fixture.tenantId);
    }
  });
});

