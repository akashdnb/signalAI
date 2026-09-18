import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { createCampaign } from "../../db/campaigns.js";
import { setCampaignMilestones } from "../../db/milestones.js";
import { findOrCreateLeadByInstagramUserId, getLead } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { insertPii } from "../../db/pii.js";
import { getCapturedFacts } from "../../db/capturedFacts.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import type { LLMProvider } from "../../llm/provider.js";
import { createLeadEventReplyHandler } from "../leadEventReplyHandler.js";

function mockProvider(replies: string[]): LLMProvider {
  let call = 0;
  return {
    name: "mock",
    generateReply: vi.fn(async () => replies[Math.min(call++, replies.length - 1)]!),
  };
}

async function seedMatchedEvent(pool: ReturnType<typeof getPool>, tenantId: string, campaignId: string, keyword: string, text: string) {
  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, "ig-user-1");
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
    const handler = createLeadEventReplyHandler(pool, provider);

    const first = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "my email is a@b.com");
    await handler({ tenantId: tenant.id, leadId: first.lead.id, leadEventId: first.event.id, sequence: 1 });

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
  });

  it("does not advance the milestone when the model reports the goal unsatisfied", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"], { replyMode: "ai_generated" });
    await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "capture email", captureField: "email" }]);

    const provider = mockProvider([
      JSON.stringify({ reply: "Could you share your email?", milestone_satisfied: false }),
    ]);
    const handler = createLeadEventReplyHandler(pool, provider);

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
    const handler = createLeadEventReplyHandler(pool, provider);

    const { lead, event } = await seedMatchedEvent(pool, tenant.id, campaign.id, "LINK", "send the link");
    await handler({ tenantId: tenant.id, leadId: lead.id, leadEventId: event.id, sequence: 1 });

    const updatedLead = await getLead(pool, tenant.id, lead.id);
    expect(updatedLead!.activeMilestoneId).toBeNull();
    expect(provider.generateReply).not.toHaveBeenCalled();
  });
});
