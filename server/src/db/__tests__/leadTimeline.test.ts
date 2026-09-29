import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { insertPii } from "../pii.js";
import { addLeadNote } from "../leadNotes.js";
import { recordSentReply } from "../sentReplies.js";
import { getLeadTimeline, getLeadTimelinePage } from "../leadTimeline.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("getLeadTimeline: merges lead_events (Meta-driven), lead_activity (CRM-driven), and sent_replies (bot-driven)", () => {
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

  it("returns both event types in chronological order", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const t0 = new Date("2026-09-01T10:00:00Z");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: t0,
      sequence: 1,
      attributes: { matchedKeyword: "PRICE" },
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, commentText: "what's the PRICE?", username: "real_handle" });

    // A note added afterward (in wall-clock time, since lead_activity.created_at defaults to now()).
    await addLeadNote(pool, { tenantId: tenant.id, leadId: lead.id, authorUserId: owner.id, body: "Called them back" });

    const timeline = await getLeadTimeline(pool, tenant.id, lead.id);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ kind: "event", eventType: "comment", text: "what's the PRICE?", matchedKeyword: "PRICE" });
    expect(timeline[1]).toMatchObject({ kind: "activity", type: "note_added", summary: "Called them back" });
  });

  it("includes the bot's own sent replies, previously entirely absent from the timeline", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "message",
      occurredAt: new Date("2026-09-01T10:00:00Z"),
      sequence: 1,
      attributes: { matchedKeyword: "product" },
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, dmText: "product", username: "real_handle" });

    await recordSentReply(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      leadEventId: event!.id,
      channel: "dm",
      engine: "ai_generated",
      text: "Here's what we offer!",
    });

    const timeline = await getLeadTimeline(pool, tenant.id, lead.id);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ kind: "event", text: "product" });
    expect(timeline[1]).toMatchObject({ kind: "reply", channel: "dm", engine: "ai_generated", text: "Here's what we offer!" });
  });

  it("returns an empty timeline for a lead with no events or activity yet", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const timeline = await getLeadTimeline(pool, tenant.id, lead.id);
    expect(timeline).toEqual([]);
  });
});

describe("getLeadTimelinePage: cursor pagination across all three sources", () => {
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

  // 5 events, one every hour, interleaved with a reply for each — enough
  // to force pagination at a small page size and to prove the merge is
  // correct across sources, not just within one.
  async function seedConversation(tenantId: string, leadId: string) {
    const pool = getPool();
    for (let i = 0; i < 5; i++) {
      const occurredAt = new Date(Date.UTC(2026, 8, 1, i));
      const event = await insertEventIdempotent(pool, {
        tenantId,
        leadId,
        metaEventId: `evt-${i}`,
        eventType: "message",
        occurredAt,
        sequence: i + 1,
      });
      await insertPii(pool, { tenantId, leadEventId: event!.id, leadId, dmText: `msg ${i}`, username: "real_handle" });
      await recordSentReply(pool, {
        tenantId,
        leadId,
        leadEventId: event!.id,
        channel: "dm",
        engine: "ai_generated",
        text: `reply ${i}`,
        sentAt: new Date(occurredAt.getTime() + 1000),
      });
    }
  }

  it("returns the most recent page first, oldest-first within the page, with a correct hasMore/nextCursor", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await seedConversation(tenant.id, lead.id);

    // 10 rows total (5 events + 5 replies), chronologically:
    // msg0, reply0, msg1, reply1, msg2, reply2, msg3, reply3, msg4, reply4
    // The most recent page of 4 is the last 4: msg3, reply3, msg4, reply4 —
    // interleaved across both sources, not just the newest source.
    const page1 = await getLeadTimelinePage(pool, tenant.id, lead.id, 4);
    expect(page1.entries.map((e) => (e.kind === "event" ? e.text : e.kind === "reply" ? e.text : e.summary))).toEqual([
      "msg 3",
      "reply 3",
      "msg 4",
      "reply 4",
    ]);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();
  });

  it("walking every page with `before` eventually reaches hasMore: false and covers every row exactly once", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await seedConversation(tenant.id, lead.id);

    const full = await getLeadTimeline(pool, tenant.id, lead.id);
    expect(full).toHaveLength(10); // 5 events + 5 replies

    const collected: typeof full = [];
    let cursor: Date | undefined;
    for (let guard = 0; guard < 20; guard++) {
      const page = await getLeadTimelinePage(pool, tenant.id, lead.id, 3, cursor);
      collected.unshift(...page.entries); // pages arrive newest-first; prepend to rebuild oldest-first overall
      if (!page.hasMore) break;
      cursor = new Date(page.nextCursor!);
    }

    expect(collected).toHaveLength(10);
    expect(collected.map((e) => e.occurredAt.getTime())).toEqual(full.map((e) => e.occurredAt.getTime()));
  });

  it("returns an empty page with hasMore false for a lead with no history", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const page = await getLeadTimelinePage(pool, tenant.id, lead.id, 50);
    expect(page).toEqual({ entries: [], hasMore: false, nextCursor: null });
  });
});
