import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { insertPii } from "../pii.js";
import { addLeadNote } from "../leadNotes.js";
import { recordSentReply } from "../sentReplies.js";
import { getLeadTimeline } from "../leadTimeline.js";
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
