import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { JourneyRuntime } from "../runtime.js";
import {
  createPublishedJourneyWithClient,
} from "../../../db/journeyVersions.js";
import { getPool } from "../../../db/pool.js";
import { createTenant } from "../../../db/tenants.js";
import type { BuilderGraph } from "../../../db/journeyGraph.js";

const pool = getPool();
const runtime = new JourneyRuntime(pool);

async function ids() {
  const tenant = await createTenant(
    pool,
    `journey-runtime-test-${randomUUID()}`,
  );

  return {
    tenantId: tenant.id,
    campaignId: randomUUID(),
    subjectKey: `subject-${randomUUID()}`,
  };
}

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

async function createCampaign(
  tenantId: string,
  campaignId: string,
): Promise<void> {
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
      tenantId,
      `runtime-test-${campaignId}`,
      [],
    ],
  );
}

async function publishJourney(
  tenantId: string,
  campaignId: string,
  version: number,
) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const published = await createPublishedJourneyWithClient(
      client,
      tenantId,
      campaignId,
      makeGraph(version),
    );

    await client.query("commit");

    return published;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function cleanup(tenantId: string): Promise<void> {
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
      delete from tenants
       where id = $1
    `,
    [tenantId],
  );
}

describe("JourneyRuntime correctness", () => {
  it("processes the same event only once", async () => {
    const { tenantId, campaignId, subjectKey } = await ids();

    try {
      await createCampaign(tenantId, campaignId);
      await publishJourney(tenantId, campaignId, 1);

      const started = await runtime.start({
        tenantId,
        campaignId,
        subjectKey,
      });

      const eventId = `event-${randomUUID()}`;

      const first = await runtime.resumeFromEvent({
        tenantId,
        executionId: started.execution.id,
        eventId,
        eventType: "user_message",
        payload: {
          text: "hello",
        },
      });

      const second = await runtime.resumeFromEvent({
        tenantId,
        executionId: started.execution.id,
        eventId,
        eventType: "user_message",
        payload: {
          text: "hello",
        },
      });

      expect(first.duplicateEvent).not.toBe(true);
      expect(second.duplicateEvent).toBe(true);

      const events = await pool.query(
        `
          select count(*)::int as count
            from journey_events
           where tenant_id = $1
             and execution_id = $2
             and event_id = $3
        `,
        [tenantId, started.execution.id, eventId],
      );

      expect(events.rows[0].count).toBe(1);
    } finally {
      await cleanup(tenantId);
    }
  });

  it("processes concurrent duplicate events only once", async () => {
    const { tenantId, campaignId, subjectKey } = await ids();

    try {
      await createCampaign(tenantId, campaignId);
      await publishJourney(tenantId, campaignId, 1);

      const started = await runtime.start({
        tenantId,
        campaignId,
        subjectKey,
      });

      const eventId = `event-${randomUUID()}`;

      const results = await Promise.all([
        runtime.resumeFromEvent({
          tenantId,
          executionId: started.execution.id,
          eventId,
          eventType: "user_message",
          payload: { text: "hello" },
        }),
        runtime.resumeFromEvent({
          tenantId,
          executionId: started.execution.id,
          eventId,
          eventType: "user_message",
          payload: { text: "hello" },
        }),
      ]);

      expect(
        results.filter(
          (result) => result.duplicateEvent !== true,
        ),
      ).toHaveLength(1);

      expect(
        results.filter(
          (result) => result.duplicateEvent === true,
        ),
      ).toHaveLength(1);

      const events = await pool.query(
        `
          select count(*)::int as count
            from journey_events
           where tenant_id = $1
             and event_id = $2
        `,
        [tenantId, eventId],
      );

      expect(events.rows[0].count).toBe(1);
    } finally {
      await cleanup(tenantId);
    }
  });

  it("serializes concurrent different events on the same execution", async () => {
    const { tenantId, campaignId, subjectKey } = await ids();

    try {
      await createCampaign(tenantId, campaignId);
      await publishJourney(tenantId, campaignId, 1);

      const started = await runtime.start({
        tenantId,
        campaignId,
        subjectKey,
      });

      const results = await Promise.all([
        runtime.resumeFromEvent({
          tenantId,
          executionId: started.execution.id,
          eventId: `event-${randomUUID()}`,
          eventType: "user_message",
          payload: { text: "one" },
        }),
        runtime.resumeFromEvent({
          tenantId,
          executionId: started.execution.id,
          eventId: `event-${randomUUID()}`,
          eventType: "user_message",
          payload: { text: "two" },
        }),
      ]);

      expect(results).toHaveLength(2);
      expect(results.every(Boolean)).toBe(true);

      const events = await pool.query(
        `
          select count(*)::int as count
            from journey_events
           where tenant_id = $1
             and execution_id = $2
        `,
        [tenantId, started.execution.id],
      );

      expect(events.rows[0].count).toBe(2);

      const execution = await pool.query(
        `
          select status, current_node_id
            from journey_executions
           where id = $1
        `,
        [started.execution.id],
      );

      expect(execution.rows).toHaveLength(1);
      expect(execution.rows[0].current_node_id).toBeTruthy();
    } finally {
      await cleanup(tenantId);
    }
  });

  it("allows only one active execution for the same subject", async () => {
    const { tenantId, campaignId, subjectKey } = await ids();

    try {
      await createCampaign(tenantId, campaignId);
      await publishJourney(tenantId, campaignId, 1);

      const results = await Promise.all([
        runtime.start({
          tenantId,
          campaignId,
          subjectKey,
        }),
        runtime.start({
          tenantId,
          campaignId,
          subjectKey,
        }),
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].execution.id).toBe(
        results[1].execution.id,
      );

      const executions = await pool.query(
        `
          select count(*)::int as count
            from journey_executions
           where tenant_id = $1
             and campaign_id = $2
             and subject_key = $3
             and status in (
               'running',
               'waiting',
               'handoff'
             )
        `,
        [tenantId, campaignId, subjectKey],
      );

      expect(executions.rows[0].count).toBe(1);
    } finally {
      await cleanup(tenantId);
    }
  });

  it("keeps an execution pinned to its published journey version", async () => {
    const { tenantId, campaignId, subjectKey } = await ids();

    try {
      await createCampaign(tenantId, campaignId);

      const v1 = await publishJourney(
        tenantId,
        campaignId,
        1,
      );

      const started = await runtime.start({
        tenantId,
        campaignId,
        subjectKey,
      });

      expect(started.execution.publishedVersion).toBe(1);
      expect(
        started.execution.publishedJourneyVersionId,
      ).toBe(v1.id);

      await publishJourney(
        tenantId,
        campaignId,
        2,
      );

      const resumed = await runtime.resumeFromEvent({
        tenantId,
        executionId: started.execution.id,
        eventId: `event-${randomUUID()}`,
        eventType: "user_message",
        payload: {
          text: "continue",
        },
      });

      expect(resumed.execution.publishedVersion).toBe(1);
      expect(
        resumed.execution.publishedJourneyVersionId,
      ).toBe(v1.id);
    } finally {
      await cleanup(tenantId);
    }
  });
});
