import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { processInstagramMessage } from "../processInstagramMessage.js";
import { JourneyRuntime } from "../../runtime.js";

import {
  createPublishedJourneyWithClient,
} from "../../../../db/journeyVersions.js";
import { getPool, closePool } from "../../../../db/pool.js";
import { createTenant } from "../../../../db/tenants.js";
import type { BuilderGraph } from "../../../../db/journeyGraph.js";

const pool = getPool();
const runtime = new JourneyRuntime(pool);

function makeGraph(version: number): BuilderGraph {
  return {
    version,
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
      {
        id: "handoff-1",
        type: "human_handoff",
        position: { x: 400, y: 0 },
        data: {},
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
      {
        id: "edge-2",
        sourceNodeId: "message-1",
        targetNodeId: "handoff-1",
        label: null,
        condition: null,
      },
    ],
  };
}

async function setup() {
  const tenant = await createTenant(
    pool,
    `instagram-webhook-test-${randomUUID()}`,
  );

  const campaignId = randomUUID();
  const subjectKey = `instagram-user-${randomUUID()}`;
  const instagramAccountId = randomUUID();

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
      `instagram-webhook-test-${campaignId}`,
      [],
    ],
  );

  await pool.query(
    `
      insert into meta_tokens (
        id,
        tenant_id,
        instagram_account_id,
        encrypted_token,
        key_version
      )
      values ($1, $2, $3, $4, $5)
    `,
    [
      instagramAccountId,
      tenant.id,
      `provider-account-${randomUUID()}`,
      Buffer.from("test-encrypted-token"),
      "test-v1",
    ],
  );

  const client = await pool.connect();

  try {
    await client.query("begin");

    await createPublishedJourneyWithClient(
      client,
      tenant.id,
      campaignId,
      makeGraph(1),
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
    subjectKey,
    instagramAccountId,
  };
}

async function cleanup(tenantId: string) {
  await pool.query(
    `
      delete from instagram_inbound_events
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from journey_events
       where tenant_id = $1
    `,
    [tenantId],
  );

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
      delete from meta_tokens
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

function message(
  subjectKey: string,
  providerEventId: string,
  instagramAccountId: string,
) {
  return {
    providerEventId,
    instagramAccountId,
    instagramUserId: subjectKey,
    eventType: "message" as const,
    messageText: "Hello",
    eventAt: new Date(),
    raw: {
      sender: {
        id: subjectKey,
      },
      recipient: {
        id: instagramAccountId,
      },
      message: {
        mid: providerEventId,
        text: "Hello",
      },
    },
  };
}

describe("processInstagramMessage", () => {
  afterAll(async () => {
    await closePool();
  });

  it("ignores a duplicate inbound provider event", async () => {
    const setupData = await setup();

    try {
      const started = await runtime.start({
        tenantId: setupData.tenantId,
        campaignId: setupData.campaignId,
        subjectKey: setupData.subjectKey,
      });

      const input = {
        tenantId: setupData.tenantId,
        instagramAccountId: setupData.instagramAccountId,
        event: message(
          setupData.subjectKey,
          `event-${randomUUID()}`,
          setupData.instagramAccountId,
        ),
      };

      const first = await processInstagramMessage(
        { pool, runtime },
        input,
      );

      const second = await processInstagramMessage(
        { pool, runtime },
        input,
      );

      expect(first).toEqual(
        expect.objectContaining({
          duplicate: false,
          status: "processed",
          executionId: started.execution.id,
        }),
      );

      expect(second).toEqual(
        expect.objectContaining({
          duplicate: true,
          status: "ignored",
          executionId: null,
        }),
      );

      const events = await pool.query(
        `
          select status, journey_execution_id
            from instagram_inbound_events
           where tenant_id = $1
             and provider_event_id = $2
        `,
        [
          setupData.tenantId,
          input.event.providerEventId,
        ],
      );

      expect(events.rows).toHaveLength(1);
      expect(events.rows[0]).toEqual({
        status: "processed",
        journey_execution_id: started.execution.id,
      });
    } finally {
      await cleanup(setupData.tenantId);
    }
  });

  it("ignores an event when there is no active execution", async () => {
    const setupData = await setup();

    try {
      const input = {
        tenantId: setupData.tenantId,
        instagramAccountId: setupData.instagramAccountId,
        event: message(
          setupData.subjectKey,
          `event-${randomUUID()}`,
          setupData.instagramAccountId,
        ),
      };

      const result = await processInstagramMessage(
        { pool, runtime },
        input,
      );

      expect(result).toEqual({
        providerEventId: input.event.providerEventId,
        duplicate: false,
        status: "ignored",
        executionId: null,
      });

      const events = await pool.query(
        `
          select status, journey_execution_id
            from instagram_inbound_events
           where tenant_id = $1
             and provider_event_id = $2
        `,
        [
          setupData.tenantId,
          input.event.providerEventId,
        ],
      );

      expect(events.rows[0]).toEqual({
        status: "ignored",
        journey_execution_id: null,
      });
    } finally {
      await cleanup(setupData.tenantId);
    }
  });

  it("resumes the single active execution and marks the event processed", async () => {
    const setupData = await setup();

    try {
      const started = await runtime.start({
        tenantId: setupData.tenantId,
        campaignId: setupData.campaignId,
        subjectKey: setupData.subjectKey,
      });

      const input = {
        tenantId: setupData.tenantId,
        instagramAccountId: setupData.instagramAccountId,
        event: message(
          setupData.subjectKey,
          `event-${randomUUID()}`,
          setupData.instagramAccountId,
        ),
      };

      const result = await processInstagramMessage(
        { pool, runtime },
        input,
      );

      expect(result.status).toBe("processed");
      expect(result.executionId).toBe(started.execution.id);

      const event = await pool.query(
        `
          select status, journey_execution_id
            from instagram_inbound_events
           where tenant_id = $1
             and provider_event_id = $2
        `,
        [
          setupData.tenantId,
          input.event.providerEventId,
        ],
      );

      expect(event.rows[0]).toEqual({
        status: "processed",
        journey_execution_id: started.execution.id,
      });
    } finally {
      await cleanup(setupData.tenantId);
    }
  });

  it("fails when multiple active executions exist for the same subject", async () => {
    const setupData = await setup();

    try {
      const secondCampaignId = randomUUID();

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
          secondCampaignId,
          setupData.tenantId,
          `second-campaign-${secondCampaignId}`,
          [],
        ],
      );

      const client = await pool.connect();

      try {
        await client.query("begin");

        await createPublishedJourneyWithClient(
          client,
          setupData.tenantId,
          secondCampaignId,
          makeGraph(1),
        );

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }

      await runtime.start({
        tenantId: setupData.tenantId,
        campaignId: setupData.campaignId,
        subjectKey: setupData.subjectKey,
      });

      await runtime.start({
        tenantId: setupData.tenantId,
        campaignId: secondCampaignId,
        subjectKey: setupData.subjectKey,
      });

      const input = {
        tenantId: setupData.tenantId,
        instagramAccountId: setupData.instagramAccountId,
        event: message(
          setupData.subjectKey,
          `event-${randomUUID()}`,
          setupData.instagramAccountId,
        ),
      };

      await expect(
        processInstagramMessage(
          { pool, runtime },
          input,
        ),
      ).rejects.toThrow(
        "Multiple active journey executions",
      );

      const event = await pool.query(
        `
          select status
            from instagram_inbound_events
           where tenant_id = $1
             and provider_event_id = $2
        `,
        [
          setupData.tenantId,
          input.event.providerEventId,
        ],
      );

      expect(event.rows[0]).toEqual({
        status: "failed",
      });
    } finally {
      await cleanup(setupData.tenantId);
    }
  });
});
