import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { upsertMediaMetadata } from "../mediaMetadata.js";
import { getTopPosts, getTopKeywords } from "../analytics.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("Phase 2A analytics: Top Performing Posts / Top Trigger Keywords", () => {
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

  it("getTopPosts counts comment events by mediaId, most-commented first, enriched with cached metadata", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    await upsertMediaMetadata(pool, tenant.id, {
      mediaId: "reel-popular",
      caption: "Our giveaway reel",
      mediaType: "REEL",
      thumbnailUrl: null,
      permalink: "https://instagram.com/reel/popular",
      postedAt: null,
    });

    for (let i = 0; i < 3; i++) {
      await insertEventIdempotent(pool, {
        tenantId: tenant.id,
        leadId: lead.id,
        metaEventId: `evt-popular-${i}`,
        eventType: "comment",
        occurredAt: new Date(),
        sequence: i + 1,
        attributes: { mediaId: "reel-popular" },
      });
    }
    await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-quiet-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 4,
      attributes: { mediaId: "reel-quiet" },
    });

    const top = await getTopPosts(pool, tenant.id);
    expect(top[0]).toMatchObject({ mediaId: "reel-popular", commentCount: 3, caption: "Our giveaway reel", permalink: "https://instagram.com/reel/popular" });
    expect(top[1]).toMatchObject({ mediaId: "reel-quiet", commentCount: 1, caption: null });
  });

  it("getTopKeywords counts events by matchedKeyword, most-matched first, ignoring unmatched events", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
      attributes: { matchedKeyword: "PRICE" },
    });
    await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-2",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 2,
      attributes: { matchedKeyword: "PRICE" },
    });
    await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-3",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 3,
      attributes: {}, // received but never matched a campaign
    });

    const top = await getTopKeywords(pool, tenant.id);
    expect(top).toEqual([{ keyword: "PRICE", matchCount: 2 }]);
  });
});
