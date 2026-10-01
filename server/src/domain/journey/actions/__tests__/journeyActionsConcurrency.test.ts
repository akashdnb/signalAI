import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import {
  claimNextJourneyAction,
  createJourneyAction,
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
    `journey-action-test-${randomUUID()}`,
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
      `action-test-${campaignId}`,
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
      [execution.rows[0]!.id],
    );

    action = await createJourneyAction(client, {
      executionId: execution.rows[0]!.id,
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
    executionId: execution.rows[0]!.id,
    actionId: action.id,
  };
}

async function cleanup(tenantId: string) {
  await pool.query(
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

  await pool.query(
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

  await pool.query(
    `
      delete from journey_executions
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from campaign_journey_versions
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from campaigns
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from tenants
       where id = $1
    `,
    [tenantId],
  );
}


async function isolateQueueForAction(actionId: string) {
  /*
   * claimNextJourneyAction() is intentionally global across tenants.
   *
   * Other integration tests/runs may leave pending or stale processing
   * actions in the shared test database. Make every unrelated action
   * temporarily non-claimable so this test exercises exactly one action.
   */
  await pool.query(
    `
      update journey_actions
         set next_attempt_at = now() + interval '1 year'
       where id <> $1
         and status = 'pending'
    `,
    [actionId],
  );

  await pool.query(
    `
      update journey_actions
         set claimed_at = now()
       where id <> $1
         and status = 'processing'
         and (
           claimed_at is null
           or claimed_at < now() - interval '1 minute'
         )
    `,
    [actionId],
  );
}

describe("journey action claiming", () => {
  afterAll(async () => {
    await closePool();
  });

  it("allows only one concurrent worker to claim a pending action", async () => {
    const fixture = await createFixture();

    try {
      await isolateQueueForAction(fixture.actionId);

      const clientA = await pool.connect();
      const clientB = await pool.connect();

      try {
        await clientA.query("begin");
        await clientB.query("begin");

        const claimA = claimNextJourneyAction(clientA);
        const claimB = claimNextJourneyAction(clientB);

        const [resultA, resultB] = await Promise.all([
          claimA,
          claimB,
        ]);

        const claims = [resultA, resultB].filter(Boolean);

        expect(claims).toHaveLength(1);
        expect(claims[0]!.id).toBe(fixture.actionId);
        expect(claims[0]!.status).toBe("processing");

        await clientA.query("rollback");
        await clientB.query("rollback");
      } finally {
        clientA.release();
        clientB.release();
      }
    } finally {
      await cleanup(fixture.tenantId);
    }
  });

  it("reclaims a stale processing action", async () => {
    const fixture = await createFixture();

    try {
      await pool.query(
        `
          update journey_actions
             set status = 'processing',
                 claimed_at = now() - interval '2 minutes'
           where id = $1
        `,
        [fixture.actionId],
      );

      const client = await pool.connect();

      try {
        await client.query("begin");

        const claimed = await claimNextJourneyAction(client, 60);

        expect(claimed).not.toBeNull();
        expect(claimed!.id).toBe(fixture.actionId);
        expect(claimed!.status).toBe("processing");
        expect(claimed!.claimedAt).not.toBeNull();

        await client.query("rollback");
      } finally {
        client.release();
      }
    } finally {
      await cleanup(fixture.tenantId);
    }
  });

  it("does not reclaim a fresh processing action", async () => {
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

      const client = await pool.connect();

      try {
        await client.query("begin");

        const claimed = await claimNextJourneyAction(client, 60);

        expect(claimed).toBeNull();

        await client.query("rollback");
      } finally {
        client.release();
      }
    } finally {
      await cleanup(fixture.tenantId);
    }
  });
});
