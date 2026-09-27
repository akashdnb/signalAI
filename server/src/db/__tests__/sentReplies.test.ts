import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { recordSentReply, listSentRepliesForLead } from "../sentReplies.js";
import { resetDb } from "../../__tests__/helpers/db.js";

async function seedEvent(pool: ReturnType<typeof getPool>, tenantId: string, leadId: string, metaEventId: string) {
  const event = await insertEventIdempotent(pool, {
    tenantId,
    leadId,
    metaEventId,
    eventType: "message",
    occurredAt: new Date(),
    sequence: 1,
  });
  return event!;
}

describe("sent replies (bot-reply timeline visibility)", () => {
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

  it("records and lists a sent reply", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await seedEvent(pool, tenant.id, lead.id, "evt-1");

    await recordSentReply(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: event.id,
      channel: "dm",
      engine: "ai_generated",
      text: "Here's what we offer!",
    });

    const replies = await listSentRepliesForLead(pool, tenant.id, lead.id);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ channel: "dm", engine: "ai_generated", text: "Here's what we offer!" });
  });

  it("records two rows for a 'both'-channel send from the same triggering event", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await seedEvent(pool, tenant.id, lead.id, "evt-1");

    await recordSentReply(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: event.id,
      channel: "dm",
      engine: "ai_generated",
      text: "Same reply text",
    });
    await recordSentReply(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: event.id,
      channel: "comment",
      engine: "ai_generated",
      text: "Same reply text",
    });

    const replies = await listSentRepliesForLead(pool, tenant.id, lead.id);
    expect(replies).toHaveLength(2);
    expect(replies.map((r) => r.channel).sort()).toEqual(["comment", "dm"]);
  });

  it("orders replies chronologically", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event1 = await seedEvent(pool, tenant.id, lead.id, "evt-1");
    const event2 = await seedEvent(pool, tenant.id, lead.id, "evt-2");

    await recordSentReply(pool, { tenantId: tenant.id, leadId: lead.id, leadEventId: event1.id, channel: "dm", engine: "rule_based", text: "first" });
    await recordSentReply(pool, { tenantId: tenant.id, leadId: lead.id, leadEventId: event2.id, channel: "dm", engine: "rule_based", text: "second" });

    const replies = await listSentRepliesForLead(pool, tenant.id, lead.id);
    expect(replies.map((r) => r.text)).toEqual(["first", "second"]);
  });

  it("is tenant/lead-scoped — never returns another lead's sent replies", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-a");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-b");
    const eventA = await seedEvent(pool, tenant.id, leadA.id, "evt-a");

    await recordSentReply(pool, { tenantId: tenant.id, leadId: leadA.id, leadEventId: eventA.id, channel: "dm", engine: "rule_based", text: "for A" });

    expect(await listSentRepliesForLead(pool, tenant.id, leadB.id)).toEqual([]);
  });
});
