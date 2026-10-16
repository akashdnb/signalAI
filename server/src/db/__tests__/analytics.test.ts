import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId, updatePipelineStage } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { upsertMediaMetadata } from "../mediaMetadata.js";
import { createDeal, updateDealStage } from "../deals.js";
import { getTopPosts, getTopKeywords, getPipelineFunnel, getRevenueSummary } from "../analytics.js";
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

describe("R4 Analytics: pipeline funnel and revenue", () => {
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

  it("getPipelineFunnel reports cumulative stage-or-later counts, excludes lost from later stages, and counts open-with-no-outcome", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    // new (stays new), contacted, qualified, meeting_scheduled, won, lost
    const stages = ["new", "contacted", "qualified", "meeting_scheduled", "won", "lost"] as const;
    for (const stage of stages) {
      const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, `ig-${stage}`);
      if (stage !== "new") {
        await updatePipelineStage(pool, { tenantId: tenant.id, leadId: lead.id, stage });
      }
    }

    const funnel = await getPipelineFunnel(pool, tenant.id);
    expect(funnel.stages.find((s) => s.key === "leads")?.count).toBe(6);
    // qualified-or-later: qualified, meeting_scheduled, won = 3 (lost excluded)
    expect(funnel.stages.find((s) => s.key === "qualified")?.count).toBe(3);
    // meeting-or-later: meeting_scheduled, won = 2
    expect(funnel.stages.find((s) => s.key === "meeting")?.count).toBe(2);
    // won = 1
    expect(funnel.stages.find((s) => s.key === "won")?.count).toBe(1);
    // open with no outcome: new, contacted, qualified, meeting_scheduled = 4 (won/lost excluded)
    expect(funnel.openWithNoOutcome).toBe(4);
  });

  it("getRevenueSummary sums only won deals with a value, grouped by currency", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    // findOrCreateLeadByInstagramUserId mints a customer for a genuinely new lead.
    const withCustomer = await pool.query<{ customer_id: string }>(`select customer_id from leads where id = $1`, [lead.id]);
    const customerId = withCustomer.rows[0]!.customer_id;

    const wonInr = await createDeal(pool, { tenantId: tenant.id, customerId, leadId: lead.id, value: 80000, currency: "INR" });
    await updateDealStage(pool, { tenantId: tenant.id, dealId: wonInr.id, stage: "won" });

    const wonUsd = await createDeal(pool, { tenantId: tenant.id, customerId, leadId: lead.id, value: 500, currency: "USD" });
    await updateDealStage(pool, { tenantId: tenant.id, dealId: wonUsd.id, stage: "won" });

    const stillOpen = await createDeal(pool, { tenantId: tenant.id, customerId, leadId: lead.id, value: 99999, currency: "INR" });
    void stillOpen; // left 'open' — must not count

    const lostDeal = await createDeal(pool, { tenantId: tenant.id, customerId, leadId: lead.id, value: 12345, currency: "INR" });
    await updateDealStage(pool, { tenantId: tenant.id, dealId: lostDeal.id, stage: "lost" });

    const noValue = await createDeal(pool, { tenantId: tenant.id, customerId, leadId: lead.id, value: null, currency: "INR" });
    await updateDealStage(pool, { tenantId: tenant.id, dealId: noValue.id, stage: "won" }); // won but no value — must not count

    const revenue = await getRevenueSummary(pool, tenant.id);
    expect(revenue).toEqual(
      expect.arrayContaining([
        { currency: "INR", total: 80000 },
        { currency: "USD", total: 500 },
      ]),
    );
    expect(revenue).toHaveLength(2);
  });
});
