import { randomBytes } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken } from "../../db/tokens.js";
import { createCampaign } from "../../db/campaigns.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { CONTINUATION_KEYWORD } from "../../lib/keywordMatch.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues } from "../../queue/leadEventsQueue.js";
import { ingestWebhookEvents } from "../webhookIngestService.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);

async function matchedFieldsFor(pool: ReturnType<typeof getPool>, metaEventId: string) {
  const result = await pool.query<{ attributes: { matchedCampaignId?: string; matchedKeyword?: string } }>(
    `select attributes from lead_events where meta_event_id = $1`,
    [metaEventId],
  );
  const attrs = result.rows[0]?.attributes ?? {};
  return { matchedCampaignId: attrs.matchedCampaignId ?? null, matchedKeyword: attrs.matchedKeyword ?? null };
}

describe("webhookIngestService — DM Conversation Continuation", () => {
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
    await sleep(250);
  });

  afterAll(async () => {
    await closePool();
  });

  it("falls back to the lead's remembered campaign when a later DM doesn't match any keyword", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createCampaign(pool, tenant.id, "Products", ["product"], { triggerSource: "message" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-1",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "tell me about your product",
      },
    ]);
    const first = await matchedFieldsFor(pool, "evt-1");
    expect(first).toEqual({ matchedCampaignId: campaign.id, matchedKeyword: "product" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-2",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "TechPro UltraBook 15", // no keyword at all
      },
    ]);
    const second = await matchedFieldsFor(pool, "evt-2");
    expect(second).toEqual({ matchedCampaignId: campaign.id, matchedKeyword: CONTINUATION_KEYWORD });
  });

  it("does not continue for a brand-new lead's first message — first-contact behavior is unchanged", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    await createCampaign(pool, tenant.id, "Products", ["product"], { triggerSource: "message" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-new",
        metaEventId: "evt-1",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "hello there",
      },
    ]);

    expect(await matchedFieldsFor(pool, "evt-1")).toEqual({ matchedCampaignId: null, matchedKeyword: null });
  });

  it("does not continue once the messaging window has closed", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createCampaign(pool, tenant.id, "Products", ["product"], { triggerSource: "message" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-1",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "product",
      },
    ]);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "user-1");
    expect(lead.activeDmCampaignId).toBe(campaign.id);
    // Slam the window shut, simulating it having closed since the last message.
    await pool.query("update leads set window_open_until = $2 where id = $1", [lead.id, new Date(0)]);

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-2",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "TechPro UltraBook 15",
      },
    ]);
    expect(await matchedFieldsFor(pool, "evt-2")).toEqual({ matchedCampaignId: null, matchedKeyword: null });
  });

  it("never continues a comment event, even when the lead has an active DM campaign", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createCampaign(pool, tenant.id, "Products", ["product"], { triggerSource: "both" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-1",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "product",
      },
    ]);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "user-1");
    expect(lead.activeDmCampaignId).toBe(campaign.id);

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-2",
        eventType: "comment",
        occurredAt: new Date(),
        commentText: "nice",
        mediaId: "media-1",
      },
    ]);
    expect(await matchedFieldsFor(pool, "evt-2")).toEqual({ matchedCampaignId: null, matchedKeyword: null });
  });

  it("does not continue once the remembered campaign has been disabled", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createCampaign(pool, tenant.id, "Products", ["product"], { triggerSource: "message" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-1",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "product",
      },
    ]);
    await pool.query("update campaigns set enabled = false where id = $1", [campaign.id]);

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-2",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "TechPro UltraBook 15",
      },
    ]);
    expect(await matchedFieldsFor(pool, "evt-2")).toEqual({ matchedCampaignId: null, matchedKeyword: null });
  });

  it("does not continue once the remembered campaign has switched to comment-only", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createCampaign(pool, tenant.id, "Products", ["product"], { triggerSource: "message" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-1",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "product",
      },
    ]);
    await pool.query("update campaigns set trigger_source = 'comment' where id = $1", [campaign.id]);

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-2",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "TechPro UltraBook 15",
      },
    ]);
    expect(await matchedFieldsFor(pool, "evt-2")).toEqual({ matchedCampaignId: null, matchedKeyword: null });
  });

  it("a real keyword match overwrites the remembered campaign to the newly matched one", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaignA = await createCampaign(pool, tenant.id, "Products", ["product"], { triggerSource: "message" });
    const campaignB = await createCampaign(pool, tenant.id, "Support", ["help"], { triggerSource: "message" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-1",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "product",
      },
    ]);
    let lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "user-1");
    expect(lead.activeDmCampaignId).toBe(campaignA.id);

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-2",
        eventType: "message",
        occurredAt: new Date(),
        dmText: "I need help",
      },
    ]);
    lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "user-1");
    expect(lead.activeDmCampaignId).toBe(campaignB.id);
    expect(await matchedFieldsFor(pool, "evt-2")).toEqual({ matchedCampaignId: campaignB.id, matchedKeyword: "help" });
  });
});
