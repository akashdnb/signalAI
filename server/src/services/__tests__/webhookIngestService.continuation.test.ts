import { randomBytes } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken } from "../../db/tokens.js";
import { createCampaign } from "../../db/campaigns.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { CONTINUATION_KEYWORD, RESTART_KEYWORD } from "../../lib/keywordMatch.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { ensureQueues } from "../../queue/leadEventsQueue.js";
import { ensureUsernameResolutionQueue } from "../../queue/usernameResolutionQueue.js";
import { ensureAlertsQueue } from "../../queue/alertsQueue.js";
import { ingestWebhookEvents } from "../webhookIngestService.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createBoundCampaign(
  pool: ReturnType<typeof getPool>,
  tenantId: string,
  instagramAccountId: string,
  name: string,
  keywords: string[],
  options?: Parameters<typeof createCampaign>[4],
) {
  const campaign = await createCampaign(pool, tenantId, name, keywords, options);
  await pool.query(
    `insert into campaign_instagram_accounts (campaign_id, meta_token_id)
     select $1, mt.id
       from meta_tokens mt
      where mt.tenant_id = $2 and mt.instagram_account_id = $3
     on conflict (campaign_id, meta_token_id) do nothing`,
    [campaign.id, tenantId, instagramAccountId],
  );
  return campaign;
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
    // DM ingestion (webhookIngestService.ts) also enqueues onto
    // username-resolution and (for a brand-new lead) alerts — previously
    // only passed against a dev database where some other test file had
    // already created them as a side effect.
    await ensureUsernameResolutionQueue(boss);
    await ensureAlertsQueue(boss);
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
    const campaign = await createBoundCampaign(pool, tenant.id, "acct-1", "Products", ["product"], { triggerSource: "message" });

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
    await createBoundCampaign(pool, tenant.id, "acct-1", "Products", ["product"], { triggerSource: "message" });

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

  it("restarts the active campaign once the messaging window has closed", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createBoundCampaign(pool, tenant.id, "acct-1", "Products", ["product"], { triggerSource: "message" });

    await ingestWebhookEvents(pool, boss, [
      {
        instagramAccountId: "acct-1",
        instagramUserId: "user-1",
        metaEventId: "evt-1",
        eventType: "message",
        occurredAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
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
        eventType: "message",
        occurredAt: new Date(),
        dmText: "TechPro UltraBook 15",
      },
    ]);
    expect(await matchedFieldsFor(pool, "evt-2")).toEqual({ matchedCampaignId: campaign.id, matchedKeyword: RESTART_KEYWORD });
  });

  it("continues a comment-started DM campaign when the commenter replies days later", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createBoundCampaign(pool, tenant.id, "acct-1", "Comment to DM", ["LINK"], { triggerSource: "both", replyChannel: "dm" });

    await ingestWebhookEvents(pool, boss, [{
      instagramAccountId: "acct-1",
      instagramUserId: "commenter-user",
      metaEventId: "evt-comment-day-0",
      eventType: "comment",
      occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      commentText: "send me LINK",
      commentId: "comment-day-0",
      mediaId: "media-1",
    }]);

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "commenter-user");
    expect(lead.activeDmCampaignId).toBe(campaign.id);
    expect(lead.windowOpenUntil).toBeNull();

    await ingestWebhookEvents(pool, boss, [{
      instagramAccountId: "acct-1",
      instagramUserId: "commenter-user",
      metaEventId: "evt-inbound-dm-day-3",
      eventType: "message",
      occurredAt: new Date(),
      dmText: "Thanks, can you tell me more?",
    }]);

    expect(await matchedFieldsFor(pool, "evt-inbound-dm-day-3")).toEqual({
      matchedCampaignId: campaign.id,
      matchedKeyword: CONTINUATION_KEYWORD,
    });
    const updatedLead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "commenter-user");
    expect(updatedLead.windowOpenUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("never continues a comment event, even when the lead has an active DM campaign", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createBoundCampaign(pool, tenant.id, "acct-1", "Products", ["product"], { triggerSource: "both" });

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
    const campaign = await createBoundCampaign(pool, tenant.id, "acct-1", "Products", ["product"], { triggerSource: "message" });

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
    const campaign = await createBoundCampaign(pool, tenant.id, "acct-1", "Products", ["product"], { triggerSource: "message" });

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
    await pool.query("update campaigns set trigger_source = 'comment', reply_channel = 'comment' where id = $1", [campaign.id]);

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
    const campaignA = await createBoundCampaign(pool, tenant.id, "acct-1", "Products", ["product"], { triggerSource: "message" });
    const campaignB = await createBoundCampaign(pool, tenant.id, "acct-1", "Support", ["help"], { triggerSource: "message" });

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
  it("does not match a journey on an unassigned account and keeps the same person separate per account", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "multi-account-tenant");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-a", accessToken: "unused" });
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-b", accessToken: "unused" });

    const campaign = await createCampaign(pool, tenant.id, "Account A only", ["product"], { triggerSource: "message" });
    await pool.query(
      `insert into campaign_instagram_accounts (campaign_id, meta_token_id)
       select $1, id from meta_tokens where tenant_id = $2 and instagram_account_id = 'acct-a'`,
      [campaign.id, tenant.id],
    );

    await ingestWebhookEvents(pool, boss, [{
      instagramAccountId: "acct-b",
      instagramUserId: "same-person",
      metaEventId: "evt-account-b-unassigned",
      eventType: "message",
      occurredAt: new Date(),
      dmText: "I want the product",
    }]);
    expect(await matchedFieldsFor(pool, "evt-account-b-unassigned")).toEqual({ matchedCampaignId: null, matchedKeyword: null });

    await ingestWebhookEvents(pool, boss, [{
      instagramAccountId: "acct-a",
      instagramUserId: "same-person",
      metaEventId: "evt-account-a-assigned",
      eventType: "message",
      occurredAt: new Date(),
      dmText: "I want the product",
    }]);
    expect(await matchedFieldsFor(pool, "evt-account-a-assigned")).toEqual({ matchedCampaignId: campaign.id, matchedKeyword: "product" });

    const identities = await pool.query<{ id: string; instagram_account_id: string | null }>(
      `select id, instagram_account_id from leads where tenant_id = $1 and instagram_user_id = $2 order by instagram_account_id`,
      [tenant.id, "same-person"],
    );
    expect(identities.rows).toHaveLength(2);
    expect(identities.rows.map((row) => row.instagram_account_id)).toEqual(["acct-a", "acct-b"]);
    expect(identities.rows[0]!.id).not.toBe(identities.rows[1]!.id);
  });

});
