import { describe, expect, it } from "vitest";
import { getPool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { recordSentReply } from "../sentReplies.js";
import { getLeadTimeline, getLeadTimelinePage } from "../leadTimeline.js";

async function seedConversation(tenantId: string, leadId: string) {
  const pool = getPool();
  const baseTime = Date.now();

  for (let i = 1; i <= 5; i += 1) {
    const occurredAt = new Date(baseTime - (10 - i) * 60_000);
    const event = await insertEventIdempotent(pool, {
      tenantId,
      leadId,
      metaEventId: `timeline-${leadId}-${i}`,
      eventType: "message",
      occurredAt,
      sequence: i,
    });

    if (!event) throw new Error(`failed to seed event ${i}`);

    await recordSentReply(pool, {
      tenantId,
      leadId,
      leadEventId: event.id,
      channel: "dm",
      engine: "ai_generated",
      text: `reply ${i}`,
      sentAt: occurredAt,
    });
  }
}

describe("lead timeline pagination", () => {
  it("returns the newest entries first and provides an opaque cursor when more history exists", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await seedConversation(tenant.id, lead.id);

    const page = await getLeadTimelinePage(pool, tenant.id, lead.id, 4);
    expect(page.entries).toHaveLength(4);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it("returns the empty page shape for a lead with no history", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const page = await getLeadTimelinePage(pool, tenant.id, lead.id, 50);
    expect(page).toEqual({ entries: [], hasMore: false, nextCursor: null });
  });

  it("walking every page with `before` eventually reaches hasMore: false and covers every row exactly once", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await seedConversation(tenant.id, lead.id);

    const full = await getLeadTimeline(pool, tenant.id, lead.id);
    expect(full).toHaveLength(10);

    const collected: typeof full = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await getLeadTimelinePage(pool, tenant.id, lead.id, 3, cursor);
      collected.unshift(...page.entries);
      if (!page.hasMore) break;
      cursor = page.nextCursor!;
    }

    expect(collected).toHaveLength(10);
    expect(new Set(collected.map((entry) => `${entry.source}:${entry.id}`)).size).toBe(10);
    expect(collected.map((entry) => `${entry.source}:${entry.id}`)).toEqual(
      full.map((entry) => `${entry.source}:${entry.id}`),
    );
  });

  it("rejects malformed opaque cursors", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    await expect(getLeadTimelinePage(pool, tenant.id, lead.id, 50, "not-a-cursor"))
      .rejects.toThrow("invalid timeline cursor");
  });
});
