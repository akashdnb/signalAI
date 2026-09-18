import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { createCampaign } from "../../db/campaigns.js";
import { setCampaignMilestones } from "../../db/milestones.js";
import { findOrCreateLeadByInstagramUserId, getLead, updateMessagingWindow } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { insertPii } from "../../db/pii.js";
import { getCapturedFacts } from "../../db/capturedFacts.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import type { LLMProvider } from "../../llm/provider.js";
import { sendInstagramMessage } from "../../lib/instagramSend.js";
import { enqueueLeadEvent } from "../../queue/leadEventsQueue.js";
import { createLeadEventReplyHandler } from "../leadEventReplyHandler.js";

vi.mock("../../lib/instagramSend.js", () => ({
  sendInstagramMessage: vi.fn(async () => {}),
}));

vi.mock("../../queue/leadEventsQueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../queue/leadEventsQueue.js")>();
  return { ...actual, enqueueLeadEvent: vi.fn(async () => {}) };
});

const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
const fakeBoss = {} as PgBoss;

function mockProvider(replies: string[]): LLMProvider {
  let call = 0;
  return {
    name: "mock",
    generateReply: vi.fn(async () => replies[Math.min(call++, replies.length - 1)]!),
  };
}

async function seedMatchedEvent(pool: ReturnType<typeof getPool>, tenantId: string, campaignId: string, keyword: string, text: string) {
  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, "ig-user-1");
  // Send preconditions (B9): an open messaging window and a connected
  // account are required before the handler will attempt any send at all.
  await updateMessagingWindow(pool, tenantId, lead.id, new Date(), new Date(Date.now() + 60 * 60 * 1000));
  await upsertToken(pool, keyring, { tenantId, instagramAccountId: "acct-1", accessToken: "token-1" });

  const event = await insertEventIdempotent(pool, {
    tenantId,
    leadId: lead.id,
    metaEventId: `evt-${Math.random()}`,
    eventType: "comment",
    occurredAt: new Date(),
    sequence: 1,
    attributes: { matchedCampaignId: campaignId, matchedKeyword: keyword },
  });
  await insertPii(pool, {
    tenantId,
    leadEventId: event!.id,
    leadId: lead.id,
    commentText: text,
    username: "real_handle",
  });
  return { lead, event: event! };
}

describe("createLeadEventReplyHandler — Milestone Engine integration", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    vi.mocked(sendInstagramMessage).mockClear();
    vi.mocked(enqueueLeadEvent).mockClear();
  });

  afterEach(() => {
    vi.mocked(sendInstagramMessage).mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await closePool();
  });

  it("advances through three milestones across three comments and lands the captured email as structured data", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], { replyMode: "ai_generated" });
    await setCampaignMilestones(pool, tenant.id, campaign.id, [
      { goalDescription: "capture email", captureField: "email" },
      { goalDescription: "send pricing" },
      { goalDescription: "book a call", captureField: "preferredTime" },
    ]);

    const provider = mockProvider([
      JSON.stringify({ reply: "Thanks! Got your email.", milestone_satisfied: true, captured_value: "a@b.com" }),
      JSON.stringify({ reply: "Here is our pricing.", milestone_satisfied: true }),
      JSON.stringify({ reply: "Booked for 3pm!", milestone_satisfied: true, captured_value: "3pm" }),
    ]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring);

    const first = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "my email is a@b.com");
    const r1 = await handler({ tenantId: tenant.id, leadId: first.lead.id, leadEventId: first.event.id, sequence: 1 });
    expect(r1).toEqual({ advance: true });

    let lead = await getLead(pool, tenant.id, first.lead.id);
    const milestone2 = lead!.activeMilestoneId;

    const second = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "sounds good");
    await handler({ tenantId: tenant.id, leadId: first.lead.id, leadEventId: second.event.id, sequence: 2 });

    lead = await getLead(pool, tenant.id, first.lead.id);
    const milestone3 = lead!.activeMilestoneId;
    expect(milestone3).not.toBe(milestone2);

    const third = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "3pm works for me");
    await handler({ tenantId: tenant.id, leadId: first.lead.id, leadEventId: third.event.id, sequence: 3 });

    const facts = await getCapturedFacts(pool, tenant.id, first.lead.id);
    expect(facts).toEqual({ email: "a@b.com", preferredTime: "3pm" });

    const advancements = await pool.query(
      "select count(*)::int as count from milestone_advancements where lead_id = $1",
      [first.lead.id],
    );
    expect(advancements.rows[0].count).toBe(3);
    expect(sendInstagramMessage).toHaveBeenCalledTimes(3);
  });

  it("does not advance the milestone when the model reports the goal unsatisfied", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], { replyMode: "ai_generated" });
    await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "capture email", captureField: "email" }]);

    const provider = mockProvider([
      JSON.stringify({ reply: "Could you share your email?", milestone_satisfied: false }),
    ]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring);

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "what is this about?");
    await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    const updatedLead = await getLead(pool, tenant.id, lead.id);
    expect(updatedLead!.activeMilestoneId).toBeTruthy(); // still on the first milestone, just set now

    const facts = await getCapturedFacts(pool, tenant.id, lead.id);
    expect(facts).toEqual({});
  });

  it("falls back to a plain B7 reply (no milestone tracking) for a campaign with no milestones configured", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"]); // rule_based, no milestones

    const provider = mockProvider(["unused"]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring);

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
    await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    const updatedLead = await getLead(pool, tenant.id, lead.id);
    expect(updatedLead!.activeMilestoneId).toBeNull();
    expect(provider.generateReply).not.toHaveBeenCalled();
    expect(sendInstagramMessage).toHaveBeenCalledTimes(1);
  });

  // R3-06 regression: neither call site passed campaign.ctaLink through,
  // so validateOutput's allowedLink was always undefined and every
  // generated link — including the campaign's own CTA — was rejected.
  // The CTA is the one action the whole funnel exists to produce.
  it("carries the campaign's CTA link into a plain (non-milestone) AI-generated reply", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], {
      replyMode: "ai_generated",
      ctaLink: "https://example.com/offer",
    });

    const provider = mockProvider(["Here you go!"]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring);

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
    await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    expect(sendInstagramMessage).toHaveBeenCalledWith(
      "token-1",
      "ig-user-1",
      expect.stringContaining("https://example.com/offer"),
    );
  });

  it("carries the campaign's CTA link into a Milestone Engine reply", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], {
      replyMode: "ai_generated",
      ctaLink: "https://example.com/offer",
    });
    await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "send pricing" }]);

    const provider = mockProvider([JSON.stringify({ reply: "Here's our pricing.", milestone_satisfied: true })]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring);

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "what's the price?");
    await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    expect(sendInstagramMessage).toHaveBeenCalledWith(
      "token-1",
      "ig-user-1",
      expect.stringContaining("https://example.com/offer"),
    );
  });

  it("closed messaging window: advances without attempting a send", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

    const provider = mockProvider(["unused"]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring);

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
    // Slam the window shut after seedMatchedEvent opened it.
    await updateMessagingWindow(pool, tenant.id, lead.id, new Date(0), new Date(0));

    const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    expect(result).toEqual({ advance: true });
    expect(sendInstagramMessage).not.toHaveBeenCalled();
  });

  it("hourly send cap reached: defers via a delayed re-enqueue and does not advance", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

    const provider = mockProvider(["unused"]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring);

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");

    // Fill the hourly cap for this account (750/hour, per Meta's ceiling).
    await pool.query(
      `insert into account_sends (tenant_id, instagram_account_id) select $1, $2 from generate_series(1, 750)`,
      [tenant.id, "acct-1"],
    );

    const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    expect(result).toEqual({ advance: false });
    expect(sendInstagramMessage).not.toHaveBeenCalled();
    expect(provider.generateReply).not.toHaveBeenCalled(); // deferred before any LLM/milestone work runs
    expect(enqueueLeadEvent).toHaveBeenCalledWith(
      fakeBoss,
      { tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 },
      { delaySeconds: expect.any(Number) },
    );
  });
});
