import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { insertPii } from "../../db/pii.js";
import { recordSentReply } from "../../db/sentReplies.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { getRecentConversationHistory } from "../conversationHistory.js";

const PRIVATE_PHONE = "PRIVATE_PHONE_9999999999";

describe("getRecentConversationHistory — Comment Reply vs DM Reply privacy boundary", () => {
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

  async function seedMixedHistory(pool: ReturnType<typeof getPool>, tenantId: string, leadId: string) {
    // A prior PRIVATE DM from the customer, and a prior bot DM reply.
    const dmEvent = await insertEventIdempotent(pool, {
      tenantId,
      leadId,
      metaEventId: "dm-1",
      eventType: "message",
      occurredAt: new Date("2026-01-01T10:00:00Z"),
      sequence: 1,
    });
    await insertPii(pool, { tenantId, leadEventId: dmEvent!.id, leadId, dmText: `my number is ${PRIVATE_PHONE}` });
    await recordSentReply(pool, {
      tenantId,
      leadId,
      leadEventId: dmEvent!.id,
      channel: "dm",
      engine: "ai_generated",
      text: `Got it, I'll call you at ${PRIVATE_PHONE}`,
    });

    // A prior PUBLIC comment from the customer, and a prior bot comment reply.
    const commentEvent = await insertEventIdempotent(pool, {
      tenantId,
      leadId,
      metaEventId: "comment-1",
      eventType: "comment",
      occurredAt: new Date("2026-01-01T11:00:00Z"),
      sequence: 2,
    });
    await insertPii(pool, { tenantId, leadEventId: commentEvent!.id, leadId, commentText: "nice post!" });
    await recordSentReply(pool, {
      tenantId,
      leadId,
      leadEventId: commentEvent!.id,
      channel: "comment",
      engine: "ai_generated",
      text: "Thanks for the love!",
    });
  }

  it("comment tier: never returns private DM content, even when the lead has prior DM history", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await seedMixedHistory(pool, tenant.id, lead.id);

    const currentEvent = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "comment-current",
      eventType: "comment",
      occurredAt: new Date("2026-01-01T12:00:00Z"),
      sequence: 3,
    });

    const history = await getRecentConversationHistory(pool, tenant.id, lead.id, currentEvent!.id, 10, "comment");

    expect(history.some((t) => t.content.includes(PRIVATE_PHONE))).toBe(false);
    expect(history).toEqual([
      { role: "user", content: "nice post!" },
      { role: "assistant", content: "Thanks for the love!" },
    ]);
  });

  it("dm tier: preserves the existing mixed-channel history behavior, unchanged", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await seedMixedHistory(pool, tenant.id, lead.id);

    const currentEvent = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "dm-current",
      eventType: "message",
      occurredAt: new Date("2026-01-01T12:00:00Z"),
      sequence: 3,
    });

    const history = await getRecentConversationHistory(pool, tenant.id, lead.id, currentEvent!.id, 10, "dm");

    // Both the private DM turn AND the public comment turn are present —
    // this is the pre-existing, deliberately-unchanged dm-tier behavior.
    expect(history.some((t) => t.content.includes(PRIVATE_PHONE))).toBe(true);
    expect(history.some((t) => t.content === "nice post!")).toBe(true);
  });

  it("comment tier returns no history at all when the lead has only ever DM'd", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const dmEvent = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "dm-1",
      eventType: "message",
      occurredAt: new Date("2026-01-01T10:00:00Z"),
      sequence: 1,
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: dmEvent!.id, leadId: lead.id, dmText: PRIVATE_PHONE });

    const currentEvent = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "comment-current",
      eventType: "comment",
      occurredAt: new Date("2026-01-01T12:00:00Z"),
      sequence: 2,
    });

    const history = await getRecentConversationHistory(pool, tenant.id, lead.id, currentEvent!.id, 10, "comment");
    expect(history).toEqual([]);
  });
});
