import { randomBytes } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken } from "../../db/tokens.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { listSentRepliesForLead, recordSentReply } from "../../db/sentReplies.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues, LEAD_EVENTS_QUEUE } from "../../queue/leadEventsQueue.js";
import { ingestWebhookEvents } from "../webhookIngestService.js";
import type { ParsedWebhookEvent } from "../../lib/instagramWebhookParser.js";

function echoEvent(overrides: Partial<ParsedWebhookEvent> = {}): ParsedWebhookEvent {
  return {
    instagramAccountId: "acct-1",
    instagramUserId: "lead-ig-1", // the recipient — see instagramWebhookParser.ts
    metaEventId: "message:mid-1",
    eventType: "message",
    occurredAt: new Date(),
    dmText: "hello from the echo",
    isEcho: true,
    metaMessageId: "mid-1",
    ...overrides,
  };
}

// Conversation memory (human replies): a human agent replying directly in
// Instagram was previously invisible everywhere — instagramWebhookParser.ts
// dropped every echo. Echoes are now ingested and correlated against our
// own sends by Meta's message id (sent_replies.meta_message_id).
describe("webhookIngestService — echo ingestion (human reply capture)", () => {
  let boss: PgBoss;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
    await ensureQueues(boss);
  });

  afterEach(async () => {
    await boss.stop({ graceful: false });
  });

  afterAll(async () => {
    await closePool();
  });

  it("records an echo with no matching sent_replies row as a human reply", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });

    await ingestWebhookEvents(pool, boss, [echoEvent()]);

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "lead-ig-1");
    const replies = await listSentRepliesForLead(pool, tenant.id, lead.id);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      engine: "human",
      channel: "dm",
      text: "hello from the echo",
      leadEventId: null,
      metaMessageId: "mid-1",
    });
  });

  it("does not duplicate a bot send that Meta echoes back", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "lead-ig-1");
    // Simulate leadEventReplyHandler.ts already having recorded this exact
    // send (with the mid Meta's Send API returned) before the echo arrives.
    await recordSentReply(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: null,
      channel: "dm",
      engine: "ai_generated",
      text: "Sure, here you go!",
      metaMessageId: "mid-1",
    });

    await ingestWebhookEvents(pool, boss, [echoEvent({ dmText: "Sure, here you go!" })]);

    const replies = await listSentRepliesForLead(pool, tenant.id, lead.id);
    expect(replies).toHaveLength(1); // the echo did not add a second row
    expect(replies[0]!.engine).toBe("ai_generated");
  });

  it("does not enqueue a lead-events job or run keyword matching for an echo", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });

    await ingestWebhookEvents(pool, boss, [echoEvent()]);

    // Scoped to this tenant, not a bare row count — other test FILES run
    // concurrently against the same pgboss schema (resetDb doesn't touch
    // it, see webhookIngestService.atomicity.test.ts), so a global count
    // is racy across the full suite.
    const jobs = await pool.query<{ data: { tenantId: string } }>(
      "select data from pgboss.job where name = $1 and data->>'tenantId' = $2",
      [LEAD_EVENTS_QUEUE, tenant.id],
    );
    expect(jobs.rows).toHaveLength(0);

    const events = await pool.query("select count(*)::int as count from lead_events where tenant_id = $1", [tenant.id]);
    expect(events.rows[0].count).toBe(0); // no lead_events row for the echo itself
  });

  it("ignores an echo for an unconnected/unknown account", async () => {
    const pool = getPool();
    await ingestWebhookEvents(pool, boss, [echoEvent({ instagramAccountId: "unknown-acct" })]);
    const replies = await pool.query("select count(*)::int as count from sent_replies");
    expect(replies.rows[0].count).toBe(0);
  });
});
