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
import { sendInstagramCommentReply, sendInstagramMessage } from "../../lib/instagramSend.js";
import { enqueueLeadEvent } from "../../queue/leadEventsQueue.js";
import { createLeadEventReplyHandler } from "../leadEventReplyHandler.js";

vi.mock("../../lib/instagramSend.js", () => ({
  sendInstagramMessage: vi.fn(async () => {}),
  sendInstagramCommentReply: vi.fn(async () => {}),
}));

vi.mock("../../queue/leadEventsQueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../queue/leadEventsQueue.js")>();
  return { ...actual, enqueueLeadEvent: vi.fn(async () => {}) };
});

const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
const fakeBoss = {} as PgBoss;
const DEFAULT_AI_CAP = 1000; // high enough that tests not exercising B10 never hit it

function mockProvider(replies: string[]): LLMProvider {
  let call = 0;
  return {
    name: "mock",
    generateReply: vi.fn(async () => replies[Math.min(call++, replies.length - 1)]!),
  };
}

async function seedMatchedEvent(
  pool: ReturnType<typeof getPool>,
  tenantId: string,
  campaignId: string,
  keyword: string,
  text: string,
  attributesOverrides: Record<string, unknown> = {},
) {
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
    attributes: { matchedCampaignId: campaignId, matchedKeyword: keyword, ...attributesOverrides },
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
    vi.mocked(sendInstagramCommentReply).mockClear();
    vi.mocked(enqueueLeadEvent).mockClear();
  });

  afterEach(() => {
    vi.mocked(sendInstagramMessage).mockResolvedValue(undefined);
    vi.mocked(sendInstagramCommentReply).mockResolvedValue(undefined);
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
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

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
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

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
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

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
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

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
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

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
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

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
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

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

  // B10: the cap is checked inside generateReply/runMilestoneCheck, before
  // the provider call — this asserts the end-to-end degrade actually
  // reaches the send (rule-based reply still goes out, nothing is dropped)
  // and that an operator alert fires.
  it("daily AI call cap reached: degrades to a rule-based reply and still sends it", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

    const provider = mockProvider(["should never be called"]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, 0); // cap of 0 — always exceeded

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
    const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    expect(result).toEqual({ advance: true });
    expect(provider.generateReply).not.toHaveBeenCalled();
    expect(sendInstagramMessage).toHaveBeenCalledTimes(1); // the rule-based fallback still goes out — nothing dropped
    const [, , text] = vi.mocked(sendInstagramMessage).mock.calls[0]!;
    expect(text).toBe(campaign.defaultReplyTemplate.replace("{{username}}", "real_handle").replace("{{keyword}}", "LINK"));
  });

  // R6-01 regression: milestone advancement used to commit before the send
  // — a failed send still left the lead's active_milestone_id pointing at
  // the NEXT milestone, so a retry would answer milestone 2 without the
  // lead ever having received milestone 1's reply.
  it("does not advance the milestone when the Instagram send fails", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], { replyMode: "ai_generated" });
    await setCampaignMilestones(pool, tenant.id, campaign.id, [
      { goalDescription: "capture email", captureField: "email" },
      { goalDescription: "send pricing" },
    ]);

    const provider = mockProvider([
      JSON.stringify({ reply: "Thanks! Got your email.", milestone_satisfied: true, captured_value: "a@b.com" }),
    ]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);
    vi.mocked(sendInstagramMessage).mockRejectedValueOnce(new Error("Instagram send failed: 500"));

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "my email is a@b.com");

    await expect(
      handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 }),
    ).rejects.toThrow("Instagram send failed");

    const after = await getLead(pool, tenant.id, lead.id);
    const milestones = await pool.query(
      "select id from campaign_milestones where campaign_id = $1 order by ordinal asc",
      [campaign.id],
    );
    const firstMilestoneId = milestones.rows[0].id;
    // Still on the first milestone — never moved to the second, which is
    // what "satisfied: true" would otherwise have committed.
    expect(after!.activeMilestoneId).toBe(firstMilestoneId);

    const advancements = await pool.query(
      "select count(*)::int as count from milestone_advancements where lead_id = $1",
      [lead.id],
    );
    expect(advancements.rows[0].count).toBe(0);

    const facts = await getCapturedFacts(pool, tenant.id, lead.id);
    expect(facts).toEqual({}); // the captured email was never merged either — the whole commit was deferred
  });

  // R6-02/R6-03: the reservation itself is what counts as "sent" for rate
  // limiting purposes (recorded atomically before the send attempt) —
  // this confirms exactly one row lands per successful handler call, not
  // zero (would mean the limiter isn't tracking) and not two (would mean
  // double-counting).
  it("records exactly one account_sends row per successful send", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"]); // rule_based

    const provider = mockProvider(["unused"]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
    await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    const rows = await pool.query(
      "select count(*)::int as count from account_sends where instagram_account_id = 'acct-1'",
    );
    expect(rows.rows[0].count).toBe(1);
  });

  describe("reply channel", () => {
    it("replyChannel 'comment': posts a public reply and never sends a DM", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyChannel: "comment" });

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link", {
        commentId: "comment-1",
      });
      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: true });
      expect(sendInstagramMessage).not.toHaveBeenCalled();
      expect(sendInstagramCommentReply).toHaveBeenCalledWith("token-1", "comment-1", expect.any(String));

      // Public comment replies aren't gated by the DM 750/hour ceiling.
      const rows = await pool.query(
        "select count(*)::int as count from account_sends where instagram_account_id = 'acct-1'",
      );
      expect(rows.rows[0].count).toBe(0);
    });

    it("replyChannel 'both': sends a DM and posts a public comment reply", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyChannel: "both" });

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link", {
        commentId: "comment-1",
      });
      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: true });
      expect(sendInstagramMessage).toHaveBeenCalledWith("token-1", "ig-user-1", expect.any(String));
      expect(sendInstagramCommentReply).toHaveBeenCalledWith("token-1", "comment-1", expect.any(String));
    });

    it("replyChannel 'comment' with no captured commentId: advances without attempting a send", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyChannel: "comment" });

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link"); // no commentId
      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: true });
      expect(sendInstagramMessage).not.toHaveBeenCalled();
      expect(sendInstagramCommentReply).not.toHaveBeenCalled();
      expect(provider.generateReply).not.toHaveBeenCalled(); // never reaches generation — nothing was deliverable
    });

    it("replyChannel 'both' with a closed messaging window: still posts the public comment reply", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyChannel: "both" });

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link", {
        commentId: "comment-1",
      });
      await updateMessagingWindow(pool, tenant.id, lead.id, new Date(0), new Date(0)); // slam the DM window shut

      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: true });
      expect(sendInstagramMessage).not.toHaveBeenCalled();
      expect(sendInstagramCommentReply).toHaveBeenCalledWith("token-1", "comment-1", expect.any(String));
    });

    it("replyChannel 'both' deferred by the DM rate cap: does not post the comment reply either", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyChannel: "both" });

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link", {
        commentId: "comment-1",
      });

      await pool.query(
        `insert into account_sends (tenant_id, instagram_account_id) select $1, $2 from generate_series(1, 750)`,
        [tenant.id, "acct-1"],
      );

      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: false });
      expect(sendInstagramMessage).not.toHaveBeenCalled();
      expect(sendInstagramCommentReply).not.toHaveBeenCalled();
    });
  });
});
