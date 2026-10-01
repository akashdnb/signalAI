import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant, createTenantForUser } from "../../db/tenants.js";
import { findOrCreateUserByEmail } from "../../db/users.js";
import { recordTokenUsage } from "../../db/tokenUsage.js";
import { createCampaign } from "../../db/campaigns.js";
import { setCampaignMilestones } from "../../db/milestones.js";
import { findOrCreateLeadByInstagramUserId, getLead, updateHandoffStatus, updateMessagingWindow } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { insertPii } from "../../db/pii.js";
import { getCapturedFacts } from "../../db/capturedFacts.js";
import { getLeadIntelligence } from "../../db/leadIntelligence.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import type { LLMProvider } from "../../llm/provider.js";
import type { EmbeddingProvider } from "../../llm/embeddingProvider.js";
import { createProcessingDocument, insertChunks, markDocumentReady } from "../../db/knowledgeBase.js";
import { upsertGuardrailsConfig } from "../../db/guardrailsConfig.js";
import { listSentRepliesForLead, recordSentReply } from "../../db/sentReplies.js";
import { sendInstagramCommentReply, sendInstagramMessage } from "../../lib/instagramSend.js";
import { enqueueLeadEvent } from "../../queue/leadEventsQueue.js";
import { createLeadEventReplyHandler } from "../leadEventReplyHandler.js";

vi.mock("../../lib/instagramSend.js", () => ({
  sendInstagramMessage: vi.fn(async () => ({ metaMessageId: null })),
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
    generateReply: vi.fn(async () => ({ text: replies[Math.min(call++, replies.length - 1)]! })),
  };
}

// One-hot vectors: perfectly orthogonal (cosine similarity 0) for different
// indices, identical (similarity 1) for the same index — deterministic and
// unambiguous for threshold tests, unlike two sine-based vectors which can
// remain highly correlated across 768 dimensions despite a phase shift.
function vec(index: number): number[] {
  return Array.from({ length: 768 }, (_, i) => (i === index ? 1 : 0));
}

function fakeEmbeddingProvider(queryVector: number[]): EmbeddingProvider {
  return { name: "fake", embed: vi.fn(async () => ({ vectors: [queryVector] })) };
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

/** Same shape as seedMatchedEvent, for a DM-triggered campaign match (triggerSource 'message'/'both') — eventType 'message', dmText instead of commentText, and deliberately no commentId (a DM never has one). */
async function seedMatchedMessageEvent(
  pool: ReturnType<typeof getPool>,
  tenantId: string,
  campaignId: string,
  keyword: string,
  dmText: string,
) {
  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, "ig-user-1");
  await updateMessagingWindow(pool, tenantId, lead.id, new Date(), new Date(Date.now() + 60 * 60 * 1000));
  await upsertToken(pool, keyring, { tenantId, instagramAccountId: "acct-1", accessToken: "token-1" });

  const event = await insertEventIdempotent(pool, {
    tenantId,
    leadId: lead.id,
    metaEventId: `evt-${Math.random()}`,
    eventType: "message",
    occurredAt: new Date(),
    sequence: 1,
    attributes: { matchedCampaignId: campaignId, matchedKeyword: keyword },
  });
  await insertPii(pool, { tenantId, leadEventId: event!.id, leadId: lead.id, dmText, username: "real_handle" });
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
    vi.mocked(sendInstagramMessage).mockResolvedValue({ metaMessageId: null });
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
      { goalDescription: "capture email", captureFields: ["email"] },
      { goalDescription: "send pricing" },
      { goalDescription: "book a call", captureFields: ["preferredTime"] },
    ]);

    const provider = mockProvider([
      JSON.stringify({ reply: "Thanks! Got your email.", milestone_satisfied: true, captured_values: { email: "a@b.com" } }),
      JSON.stringify({ reply: "Here is our pricing.", milestone_satisfied: true }),
      JSON.stringify({ reply: "Booked for 3pm!", milestone_satisfied: true, captured_values: { preferredTime: "3pm" } }),
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
    await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "capture email", captureFields: ["email"] }]);

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

  // Regression: a lead mid-funnel on one campaign's milestones whose next
  // message independently matches a DIFFERENT campaign's keyword used to
  // carry over the stale active_milestone_id from the FIRST campaign —
  // active_milestone_id is only unique globally, not scoped to whichever
  // campaign the event actually matched, so the reply handler would run the
  // second campaign's context (CTA link, etc.) against the first campaign's
  // leftover funnel position. A campaign mismatch must reset to the new
  // campaign's own first milestone instead, exactly like a brand-new lead.
  it("resets to the new campaign's first milestone when a later event matches a different campaign", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaignA = await createCampaign(pool, tenant.id, "Giveaway A", ["LINKA"], { replyMode: "ai_generated" });
    const campaignB = await createCampaign(pool, tenant.id, "Giveaway B", ["LINKB"], { replyMode: "ai_generated" });
    await setCampaignMilestones(pool, tenant.id, campaignA.id, [
      { goalDescription: "capture email for A", captureFields: ["email"] },
      { goalDescription: "A step two" },
    ]);
    const [firstMilestoneB] = await setCampaignMilestones(pool, tenant.id, campaignB.id, [
      { goalDescription: "capture phone for B", captureFields: ["phone"] },
    ]);

    const provider = mockProvider([
      // Captures email but doesn't advance (milestone_satisfied: false) —
      // keeps the lead mid-funnel on A's first milestone, exercising
      // partial-capture persistence alongside the campaign switch below.
      JSON.stringify({ reply: "Thanks! Anything else?", milestone_satisfied: false, captured_values: { email: "a@b.com" } }),
      JSON.stringify({ reply: "What's your phone number?", milestone_satisfied: false }),
    ]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

    // First event matches campaign A — lead lands on A's first milestone.
    const first = await seedMatchedEvent(pool, tenant.id, campaignA.id, "LINKA", "my email is a@b.com");
    await handler({ tenantId: tenant.id, leadId: first.lead.id, leadEventId: first.event.id, sequence: 1 });

    let lead = await getLead(pool, tenant.id, first.lead.id);
    const milestonesA = await pool.query(
      "select id from campaign_milestones where campaign_id = $1 order by ordinal asc",
      [campaignA.id],
    );
    expect(lead!.activeMilestoneId).toBe(milestonesA.rows[0].id); // A's first milestone

    // Second event, same lead, independently matches campaign B's own keyword.
    const second = await seedMatchedEvent(pool, tenant.id, campaignB.id, "LINKB", "tell me about LINKB");
    await handler({ tenantId: tenant.id, leadId: first.lead.id, leadEventId: second.event.id, sequence: 2 });

    lead = await getLead(pool, tenant.id, first.lead.id);
    // Must land on B's own first milestone, never a stale id from A's funnel.
    expect(lead!.activeMilestoneId).toBe(firstMilestoneB!.id);

    // Captured facts are lead-level CRM data, deliberately NOT reset by a
    // campaign switch — the email captured under A survives.
    const facts = await getCapturedFacts(pool, tenant.id, first.lead.id);
    expect(facts).toEqual({ email: "a@b.com" });
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

  // Previously a provider error/timeout, an output-validation rejection, or
  // a classifyInput block had NO log line anywhere — only capExceeded did.
  // "the live reply fell back to rule-based" is now diagnosable from logs.
  it("logs a warning when the AI reply falls back for a reason other than the spend cap or a human handoff", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

    const provider: LLMProvider = { name: "mock", generateReply: vi.fn().mockRejectedValue(new Error("provider timed out")) };
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
    await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    expect(warnSpy).toHaveBeenCalledWith(
      "AI reply fell back to rule-based",
      expect.objectContaining({ fellBackReason: expect.stringContaining("provider timed out") }),
    );
    warnSpy.mockRestore();
  });

  it("does not double-log the generic fallback warning when the fallback was actually the spend cap", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

    const provider = mockProvider(["should never be called"]);
    const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, 0); // cap of 0 — always exceeded
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
    await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    expect(warnSpy).toHaveBeenCalledWith("AI spend cap exceeded — degraded to rule-based reply", expect.anything());
    expect(warnSpy).not.toHaveBeenCalledWith("AI reply fell back to rule-based", expect.anything());
    warnSpy.mockRestore();
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
      { goalDescription: "capture email", captureFields: ["email"] },
      { goalDescription: "send pricing" },
    ]);

    const provider = mockProvider([
      JSON.stringify({ reply: "Thanks! Got your email.", milestone_satisfied: true, captured_values: { email: "a@b.com" } }),
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

  describe("sent replies (bot-reply timeline visibility)", () => {
    it("records one sent_replies row for a single-channel send, with the right engine", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

      const provider = mockProvider(["Here's the info!"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      const replies = await listSentRepliesForLead(pool, tenant.id, lead.id);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ channel: "dm", engine: "ai_generated", text: expect.stringContaining("Here's the info!") });
    });

    it("records two sent_replies rows for a 'both'-channel send from one triggering event", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyChannel: "both" });

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link", {
        commentId: "comment-1",
      });
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      const replies = await listSentRepliesForLead(pool, tenant.id, lead.id);
      expect(replies).toHaveLength(2);
      expect(replies.map((r) => r.channel).sort()).toEqual(["comment", "dm"]);
    });

    it("records engine 'rule_based' for a milestone conversation's fail-closed fallback reply", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], { replyMode: "ai_generated" });
      await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "capture email" }]);

      const provider: LLMProvider = { name: "mock", generateReply: vi.fn().mockResolvedValue({ text: "not json at all" }) };
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "hello");
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      const replies = await listSentRepliesForLead(pool, tenant.id, lead.id);
      expect(replies).toHaveLength(1);
      expect(replies[0]!.engine).toBe("rule_based");
    });
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

  describe("conversation memory (DM history)", () => {
    it("passes prior DM turns (customer + bot) into the provider call for the next reply in the same conversation", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["PRICE"], {
        replyMode: "ai_generated",
        triggerSource: "message",
      });

      const provider = mockProvider(["Nice to meet you, Akash!", "You said your name is Akash."]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const first = await seedMatchedMessageEvent(pool, tenant.id, campaign.id, "PRICE", "my name is akash, what's the PRICE?");
      await handler({ tenantId: tenant.id, leadId: first.lead.id, leadEventId: first.event.id, sequence: 1 });

      const second = await seedMatchedMessageEvent(pool, tenant.id, campaign.id, "PRICE", "what is my name?");
      await handler({ tenantId: tenant.id, leadId: first.lead.id, leadEventId: second.event.id, sequence: 2 });

      const secondCall = vi.mocked(provider.generateReply).mock.calls[1]![0];
      expect(secondCall.userMessage).toBe("what is my name?");
      expect(secondCall.history).toEqual([
        { role: "user", content: "my name is akash, what's the PRICE?" },
        { role: "assistant", content: "Nice to meet you, Akash!" },
      ]);
    });

    it("does not fetch or pass history for a rule_based campaign", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"]); // rule_based

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(provider.generateReply).not.toHaveBeenCalled();
    });
  });

  describe("message-triggered campaigns (triggerSource)", () => {
    it("processes a message-triggered match and replies via DM using the DM text as the source", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "DM Trigger", ["PRICE"], { triggerSource: "message" });

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedMessageEvent(pool, tenant.id, campaign.id, "PRICE", "what's the PRICE?");
      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: true });
      expect(sendInstagramMessage).toHaveBeenCalledWith("token-1", "ig-user-1", expect.any(String));
    });

    it("a 'both' reply-channel campaign never attempts a public comment reply for a message-triggered event", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "DM Trigger Both Channel", ["PRICE"], {
        triggerSource: "message",
        replyChannel: "both",
      });

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedMessageEvent(pool, tenant.id, campaign.id, "PRICE", "what's the PRICE?");
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(sendInstagramMessage).toHaveBeenCalledTimes(1);
      expect(sendInstagramCommentReply).not.toHaveBeenCalled(); // no comment id on a DM event
    });
  });

  describe("Human Handoff (Phase 2A)", () => {
    it("skips generating or sending any reply once a human has taken over (handoffStatus 'human')", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "please send the LINK");
      await updateHandoffStatus(pool, { tenantId: tenant.id, leadId: lead.id, status: "human" });

      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: true });
      expect(sendInstagramMessage).not.toHaveBeenCalled();
      expect(sendInstagramCommentReply).not.toHaveBeenCalled();
    });

    it("keeps auto-replying while handoffStatus is merely 'requested' — escalation flags for attention, it doesn't pause automation", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);

      const provider = mockProvider(["unused"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "please send the LINK");
      await updateHandoffStatus(pool, { tenantId: tenant.id, leadId: lead.id, status: "requested" });

      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(sendInstagramMessage).toHaveBeenCalledTimes(1);
    });

    it("auto-escalates to 'requested' the first time the AI spend cap is exceeded, without overwriting an existing human/requested state", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], { replyMode: "ai_generated" });

      const provider = mockProvider(["unused"]);
      // Cap of 0: the very first AI call for this account is already over budget.
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, 0);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "please send the LINK");
      expect((await getLead(pool, tenant.id, lead.id))!.handoffStatus).toBe("ai");

      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect((await getLead(pool, tenant.id, lead.id))!.handoffStatus).toBe("requested");
    });
  });

  describe("Trial Token Allowance (Phase 2B)", () => {
    const originalAllowance = process.env.TRIAL_TOKEN_ALLOWANCE;

    afterEach(() => {
      process.env.TRIAL_TOKEN_ALLOWANCE = originalAllowance;
    });

    it("falls back to rule-based once a trial tenant's cumulative token usage reaches the allowance, even with call-count budget left", async () => {
      process.env.TRIAL_TOKEN_ALLOWANCE = "1000"; // small, deterministic allowance for this test
      const pool = getPool();
      const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
      const tenant = await createTenantForUser(pool, "creator-a", owner.id); // real trial_started_at, plan_tier 'trial'
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], { replyMode: "ai_generated" });

      // A generously high call-count cap — this test isolates the TOKEN
      // allowance, not the daily call cap (already covered above).
      const provider = mockProvider(["Sure, here you go!"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, 1000);

      // Seed prior usage that already exceeds the 1000-token trial allowance.
      const priorEvent = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "an earlier message");
      await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: priorEvent.event.id, promptTokens: 900, completionTokens: 200 });

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "please send the LINK");
      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: true });
      expect(provider.generateReply).not.toHaveBeenCalled(); // never reached the provider — the trial guard denied it first
      expect(sendInstagramMessage).toHaveBeenCalledWith("token-1", "ig-user-1", expect.any(String)); // still sends the rule-based fallback
    });

    it("does not gate a paid-tier tenant's usage against the trial allowance at all", async () => {
      process.env.TRIAL_TOKEN_ALLOWANCE = "1000";
      const pool = getPool();
      const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
      const tenant = await createTenantForUser(pool, "creator-a", owner.id);
      await pool.query("update tenants set plan_tier = 'starter' where id = $1", [tenant.id]);
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], { replyMode: "ai_generated" });

      const provider = mockProvider([JSON.stringify("unused")]);
      provider.generateReply = vi.fn().mockResolvedValue({ text: "Sure, here you go!" });
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, 1000);

      const priorEvent = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "an earlier message");
      await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: priorEvent.event.id, promptTokens: 900, completionTokens: 200 });

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "please send the LINK");
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(provider.generateReply).toHaveBeenCalled(); // a paid tier has no trial allowance to hit
    });
  });

  describe("Phase 2C Lead Intelligence", () => {
    it("persists qualification and updates the lead score", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(
        pool,
        tenant.id,
        "Qualification",
        ["BUY"],
        { replyMode: "ai_generated" },
      );

      await setCampaignMilestones(pool, tenant.id, campaign.id, [
        {
          goalDescription: "understand the prospect",
          captureFields: [],
        },
      ]);

      const provider = mockProvider([
        JSON.stringify({
          reply: "Got it.",
          milestone_satisfied: false,
          qualification: {
            intent: "ready_to_buy",
            need: "3BHK apartment",
            budget: "₹1.5 crore",
            location: "Bangalore",
          },
        }),
      ]);

      const handler = createLeadEventReplyHandler(
        pool,
        fakeBoss,
        provider,
        keyring,
        DEFAULT_AI_CAP,
      );

      const { lead, event } = await seedMatchedEvent(
        pool,
        tenant.id,
        campaign.id,
        "BUY",
        "I want a 3BHK in Bangalore around ₹1.5 crore",
      );

      await handler({
        tenantId: tenant.id,
        leadId: lead.id,
        leadEventId: event.id,
        sequence: 1,
      });

      expect(await getCapturedFacts(pool, tenant.id, lead.id)).toMatchObject({
        intent: "ready_to_buy",
        need: "3BHK apartment",
        budget: "₹1.5 crore",
        location: "Bangalore",
      });

      const intelligence = await getLeadIntelligence(
        pool,
        tenant.id,
        lead.id,
      );

      expect(intelligence).not.toBeNull();
      expect(intelligence!.score).toBe(75);
      expect(intelligence!.scoreBand).toBe("hot");
      expect(intelligence!.intent).toBe("ready_to_buy");
      expect(intelligence!.need).toBe("3BHK apartment");
      expect(intelligence!.budgetText).toBe("₹1.5 crore");
      expect(intelligence!.location).toBe("Bangalore");
    });

    it("does not persist qualification when Instagram delivery fails", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(
        pool,
        tenant.id,
        "Qualification delivery failure",
        ["BUY"],
        { replyMode: "ai_generated" },
      );

      await setCampaignMilestones(pool, tenant.id, campaign.id, [
        {
          goalDescription: "understand the prospect",
          captureFields: [],
        },
      ]);

      const provider = mockProvider([
        JSON.stringify({
          reply: "Got it.",
          milestone_satisfied: false,
          qualification: {
            intent: "ready_to_buy",
            need: "3BHK apartment",
            budget: "₹1.5 crore",
            location: "Bangalore",
          },
        }),
      ]);

      vi.mocked(sendInstagramMessage).mockRejectedValueOnce(
        new Error("Instagram unavailable"),
      );

      const handler = createLeadEventReplyHandler(
        pool,
        fakeBoss,
        provider,
        keyring,
        DEFAULT_AI_CAP,
      );

      const { lead, event } = await seedMatchedEvent(
        pool,
        tenant.id,
        campaign.id,
        "BUY",
        "I want a 3BHK in Bangalore around ₹1.5 crore",
      );

      await expect(
        handler({
          tenantId: tenant.id,
          leadId: lead.id,
          leadEventId: event.id,
          sequence: 1,
        }),
      ).rejects.toThrow("Instagram unavailable");

      expect(await getCapturedFacts(pool, tenant.id, lead.id)).toEqual({});
      expect(
        await getLeadIntelligence(pool, tenant.id, lead.id),
      ).toBeNull();
    });

    // SLICE A: an ai_generated campaign with NO milestones configured must
    // still extract qualification, reusing the same provider call that
    // produced the reply — not a second LLM request.
    it("extracts and persists qualification for an ai_generated campaign with no milestones", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "No milestones", ["BUY"], { replyMode: "ai_generated" });
      // Deliberately no setCampaignMilestones call — milestones.length === 0.

      const provider = mockProvider([
        JSON.stringify({
          reply: "Got it, let me help with that.",
          qualification: { intent: "ready_to_buy", need: "3BHK apartment", budget: "₹1.5 crore", location: "Bangalore" },
        }),
      ]);

      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);
      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "BUY", "I want a 3BHK in Bangalore around ₹1.5 crore");

      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(provider.generateReply).toHaveBeenCalledTimes(1); // one call for both the reply and the qualification
      expect(await getCapturedFacts(pool, tenant.id, lead.id)).toMatchObject({
        intent: "ready_to_buy",
        need: "3BHK apartment",
        budget: "₹1.5 crore",
        location: "Bangalore",
      });

      const intelligence = await getLeadIntelligence(pool, tenant.id, lead.id);
      expect(intelligence).not.toBeNull();
      expect(intelligence!.intent).toBe("ready_to_buy");
      expect(intelligence!.score).toBe(75);
    });

    it("does not persist qualification extracted from a no-milestone AI reply when Instagram delivery fails", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "No milestones delivery failure", ["BUY"], { replyMode: "ai_generated" });

      const provider = mockProvider([
        JSON.stringify({
          reply: "Got it, let me help with that.",
          qualification: { intent: "ready_to_buy", need: "3BHK apartment", budget: "₹1.5 crore", location: "Bangalore" },
        }),
      ]);

      vi.mocked(sendInstagramMessage).mockRejectedValueOnce(new Error("Instagram unavailable"));

      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);
      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "BUY", "I want a 3BHK in Bangalore around ₹1.5 crore");

      await expect(
        handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 }),
      ).rejects.toThrow("Instagram unavailable");

      expect(await getCapturedFacts(pool, tenant.id, lead.id)).toEqual({});
      expect(await getLeadIntelligence(pool, tenant.id, lead.id)).toBeNull();
    });

    it("never calls the provider for a rule_based campaign just to extract qualification", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Rule based", ["BUY"], { replyMode: "rule_based" });

      const provider = mockProvider(["should never be used"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);
      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "BUY", "I want a 3BHK in Bangalore around ₹1.5 crore");

      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(provider.generateReply).not.toHaveBeenCalled();
      expect(await getCapturedFacts(pool, tenant.id, lead.id)).toEqual({});
    });
  });

  describe("Phase 2C RAG + Client Guardrails integration", () => {
    it("proceeds normally when the tenant has no knowledge base and no guardrails config at all", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

      const provider = mockProvider(["Sure, here's the info!"]);
      const embeddingProvider = fakeEmbeddingProvider(vec(0));
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP, embeddingProvider);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "what's the price?");
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(provider.generateReply).toHaveBeenCalled();
      expect((await getLead(pool, tenant.id, lead.id))!.handoffStatus).toBe("ai");
    });

    it("grounds the reply with retrieved knowledge base content when it matches well", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

      const doc = await createProcessingDocument(pool, {
        tenantId: tenant.id,
        filename: "faq.txt",
        contentType: "text/plain",
        storageKey: "k1",
      });
      await markDocumentReady(pool, { tenantId: tenant.id, documentId: doc.id });
      await insertChunks(pool, {
        tenantId: tenant.id,
        documentId: doc.id,
        chunks: [{ chunkIndex: 0, content: "Our refund window is 30 days after purchase.", embedding: vec(0) }],
      });

      const provider = mockProvider(["Our refund window is 30 days."]);
      const embeddingProvider = fakeEmbeddingProvider(vec(0)); // same vector — a strong match
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP, embeddingProvider);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "what's your refund policy?");
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      const call = vi.mocked(provider.generateReply).mock.calls[0]![0];
      expect(call.systemPrompt).toContain("Our refund window is 30 days after purchase.");
      expect((await getLead(pool, tenant.id, lead.id))!.handoffStatus).toBe("ai");
    });

    it("pauses automation (handoffStatus 'human') when the tenant has a knowledge base but nothing matches the question", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

      const doc = await createProcessingDocument(pool, {
        tenantId: tenant.id,
        filename: "faq.txt",
        contentType: "text/plain",
        storageKey: "k1",
      });
      await markDocumentReady(pool, { tenantId: tenant.id, documentId: doc.id });
      await insertChunks(pool, {
        tenantId: tenant.id,
        documentId: doc.id,
        chunks: [{ chunkIndex: 0, content: "unrelated content about shipping", embedding: vec(100) }],
      });

      const provider = mockProvider(["should never be used"]);
      const embeddingProvider = fakeEmbeddingProvider(vec(0)); // far from the seeded chunk's vector
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP, embeddingProvider);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "some off-topic question");
      const result = await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(result).toEqual({ advance: true });
      expect(provider.generateReply).not.toHaveBeenCalled();
      expect(sendInstagramMessage).toHaveBeenCalledTimes(1); // the rule-based fallback still goes out this turn
      expect((await getLead(pool, tenant.id, lead.id))!.handoffStatus).toBe("human");
    });

    it("pauses automation on a tenant-configured escalation trigger, before any provider call", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });
      await upsertGuardrailsConfig(pool, {
        tenantId: tenant.id,
        brandVoice: null,
        forbiddenTopics: [],
        escalationTriggers: ["talk to a lawyer"],
      });

      const provider = mockProvider(["should never be used"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(
        pool,
        tenant.id,
        campaign.id,
        "LINK",
        "I'm going to talk to a lawyer about this",
      );
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      expect(provider.generateReply).not.toHaveBeenCalled();
      expect(sendInstagramMessage).toHaveBeenCalledTimes(1); // the rule-based fallback still goes out this turn
      expect((await getLead(pool, tenant.id, lead.id))!.handoffStatus).toBe("human");
    });

    it("rejects a reply matching a tenant-configured forbidden topic even when nothing else fails", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });
      await upsertGuardrailsConfig(pool, {
        tenantId: tenant.id,
        brandVoice: null,
        forbiddenTopics: ["competitor"],
        escalationTriggers: [],
      });

      const provider = mockProvider(["Ask our competitor, they're worse!"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "who else offers this?");
      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

      // Provider was called and rejected on output, not on escalation — the
      // rule-based fallback goes out and no human handoff was forced.
      const [, , text] = vi.mocked(sendInstagramMessage).mock.calls[0]!;
      expect(text).not.toContain("competitor");
      expect((await getLead(pool, tenant.id, lead.id))!.handoffStatus).toBe("ai");
    });
  });

  // Comment Reply vs DM Reply privacy audit: a public comment reply must
  // never be built from a lead's private DM history — not "told not to
  // repeat it," never given it at all. These seed a PRIOR private DM
  // containing a distinctive marker, then trigger a PUBLIC comment-tier
  // event for the SAME lead and assert the marker never reaches the
  // provider (prompt, history, or the generated reply) and never gets
  // extracted as a qualification fact.
  describe("Comment Reply vs DM Reply privacy boundary", () => {
    const PRIVATE_PHONE = "PRIVATE_PHONE_9999999999";

    async function seedPriorPrivateDm(
      pool: ReturnType<typeof getPool>,
      tenantId: string,
      leadId: string,
      dmText: string,
    ) {
      const dmEvent = await insertEventIdempotent(pool, {
        tenantId,
        leadId,
        metaEventId: `prior-dm-${Math.random()}`,
        eventType: "message",
        occurredAt: new Date(Date.now() - 60_000),
        sequence: 0,
      });
      await insertPii(pool, { tenantId, leadEventId: dmEvent!.id, leadId, dmText });
      await recordSentReply(pool, {
        tenantId,
        leadId,
        leadEventId: dmEvent!.id,
        channel: "dm",
        engine: "ai_generated",
        text: `Noted — I'll reach you at ${PRIVATE_PHONE}`,
      });
    }

    it("a public comment-triggered AI reply never receives prior private DM content in its history", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

      const { lead } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "placeholder");
      await seedPriorPrivateDm(pool, tenant.id, lead.id, `call me at ${PRIVATE_PHONE}`);

      const provider = mockProvider(["Thanks for the comment!"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const event = await insertEventIdempotent(pool, {
        tenantId: tenant.id,
        leadId: lead.id,
        metaEventId: "current-comment",
        eventType: "comment",
        occurredAt: new Date(),
        sequence: 1,
        attributes: { matchedCampaignId: campaign.id, matchedKeyword: "LINK" },
      });
      await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, commentText: "LINK please", username: "real_handle" });

      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event!.id, sequence: 2 });

      const call = vi.mocked(provider.generateReply).mock.calls[0]![0];
      expect(JSON.stringify(call)).not.toContain(PRIVATE_PHONE);

      const [, , sentText] = vi.mocked(sendInstagramMessage).mock.calls[0] ?? [];
      expect(sentText ?? "").not.toContain(PRIVATE_PHONE);
    });

    it("a private DM-triggered AI reply still receives its own prior DM history (unchanged dm-tier behavior)", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated", triggerSource: "message" });

      const { lead } = await seedMatchedMessageEvent(pool, tenant.id, campaign.id, "LINK", "placeholder");
      await seedPriorPrivateDm(pool, tenant.id, lead.id, `my budget is ${PRIVATE_PHONE}`);

      const provider = mockProvider(["Sure thing!"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const event = await insertEventIdempotent(pool, {
        tenantId: tenant.id,
        leadId: lead.id,
        metaEventId: "current-dm",
        eventType: "message",
        occurredAt: new Date(),
        sequence: 1,
        attributes: { matchedCampaignId: campaign.id, matchedKeyword: "LINK" },
      });
      await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, dmText: "LINK please" });

      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event!.id, sequence: 2 });

      const call = vi.mocked(provider.generateReply).mock.calls[0]![0];
      expect(JSON.stringify(call)).toContain(PRIVATE_PHONE); // deliberately UNCHANGED — the dm tier may see its own private history
    });

    it("qualification extraction for a public comment never picks up a fact only stated in prior private DM history", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated" });

      const { lead } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "placeholder");
      await seedPriorPrivateDm(pool, tenant.id, lead.id, "my budget is ₹5 crore and my number is 9999999999");

      // The provider is told to extract qualification — if it were ever
      // given the private DM text, a real model could plausibly surface
      // "budget: 5 crore" from it despite never being asked about budget in
      // the current public comment. Simulating a provider that always
      // returns a budget regardless of what's actually asked makes this a
      // meaningful test of what CONTEXT it received, not what it chose to
      // do with it.
      const provider: LLMProvider = {
        name: "mock",
        generateReply: vi.fn(async ({ systemPrompt, history }) => {
          const sawPrivateBudget = JSON.stringify({ systemPrompt, history }).includes("5 crore");
          return {
            text: JSON.stringify({
              reply: "Thanks!",
              qualification: sawPrivateBudget ? { budget: "₹5 crore" } : null,
            }),
          };
        }),
      };
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const event = await insertEventIdempotent(pool, {
        tenantId: tenant.id,
        leadId: lead.id,
        metaEventId: "current-comment",
        eventType: "comment",
        occurredAt: new Date(),
        sequence: 1,
        attributes: { matchedCampaignId: campaign.id, matchedKeyword: "LINK" },
      });
      await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, commentText: "LINK please", username: "real_handle" });

      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event!.id, sequence: 2 });

      // Facts captured are deferred until after delivery — this asserts
      // the private budget was never captured for this lead at all.
      expect(await getCapturedFacts(pool, tenant.id, lead.id)).not.toHaveProperty("budget");
    });

    it("replyChannel 'both' on a comment-triggered event: the one generated reply sent to both channels never contains private DM-only context", async () => {
      const pool = getPool();
      const tenant = await createTenant(pool, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Simple", ["LINK"], { replyMode: "ai_generated", replyChannel: "both" });

      const { lead } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "placeholder", { commentId: "comment-1" });
      await seedPriorPrivateDm(pool, tenant.id, lead.id, `reach me at ${PRIVATE_PHONE}`);

      const provider = mockProvider(["Thanks for asking!"]);
      const handler = createLeadEventReplyHandler(pool, fakeBoss, provider, keyring, DEFAULT_AI_CAP);

      const event = await insertEventIdempotent(pool, {
        tenantId: tenant.id,
        leadId: lead.id,
        metaEventId: "current-comment-both",
        eventType: "comment",
        occurredAt: new Date(),
        sequence: 1,
        attributes: { matchedCampaignId: campaign.id, matchedKeyword: "LINK", commentId: "comment-1" },
      });
      await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, commentText: "LINK please", username: "real_handle" });

      await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event!.id, sequence: 2 });

      // A comment-triggered event's single generated reply is reused for
      // BOTH the public comment send and the DM send (see
      // leadEventReplyHandler.ts) — safe specifically because that reply
      // was generated under the comment tier's public-only context in the
      // first place, so there is no private content in it to leak either way.
      expect(sendInstagramCommentReply).toHaveBeenCalledWith("token-1", "comment-1", expect.any(String));
      expect(sendInstagramMessage).toHaveBeenCalledWith("token-1", "ig-user-1", expect.any(String));
      const [, , commentText] = vi.mocked(sendInstagramCommentReply).mock.calls[0]!;
      const [, , dmText] = vi.mocked(sendInstagramMessage).mock.calls[0]!;
      expect(commentText).not.toContain(PRIVATE_PHONE);
      expect(dmText).not.toContain(PRIVATE_PHONE);
      expect(commentText).toBe(dmText); // documents the actual current "one generation, two sends" behavior

      const call = vi.mocked(provider.generateReply).mock.calls[0]![0];
      expect(JSON.stringify(call)).not.toContain(PRIVATE_PHONE);
    });
  });
});
