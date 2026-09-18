import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { findOrCreateLeadByInstagramUserId, getLead } from "../leads.js";
import { insertEventIdempotent, getEventForReply } from "../events.js";
import { insertPii } from "../pii.js";
import { createCampaign, getCampaign, listActiveCampaignKeywords, listCampaigns } from "../campaigns.js";
import { getCapturedFacts, mergeCapturedFacts } from "../capturedFacts.js";
import { resetDb } from "../../__tests__/helpers/db.js";

/**
 * R1-12 review fix: the roadmap permits enforcing tenancy in the
 * data-access layer instead of RLS, which is fine — but that promise is
 * unverified without a test proving every read path actually returns
 * nothing for the wrong tenant_id. This is that test.
 */
describe("R1-12: cross-tenant isolation across every read path", () => {
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

  it("a lead created under tenant A is invisible to tenant B", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-1");

    expect(await getLead(pool, tenantA.id, lead.id)).not.toBeNull();
    expect(await getLead(pool, tenantB.id, lead.id)).toBeNull();
  });

  it("an event and its PII created under tenant A are invisible to tenant B", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenantA.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, {
      tenantId: tenantA.id,
      leadEventId: event!.id,
      leadId: lead.id,
      commentText: "secret",
    });

    expect(await getEventForReply(pool, tenantA.id, event!.id)).not.toBeNull();
    expect(await getEventForReply(pool, tenantB.id, event!.id)).toBeNull();

    const crossTenantPii = await pool.query("select * from lead_pii where lead_event_id = $1 and tenant_id = $2", [
      event!.id,
      tenantB.id,
    ]);
    expect(crossTenantPii.rows).toHaveLength(0);
  });

  it("a campaign created under tenant A is invisible to tenant B, including the hot matching-path query", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");
    const campaign = await createCampaign(pool, tenantA.id, "Giveaway", ["LINK"]);

    expect(await getCampaign(pool, tenantA.id, campaign.id)).not.toBeNull();
    expect(await getCampaign(pool, tenantB.id, campaign.id)).toBeNull();

    expect(await listCampaigns(pool, tenantB.id)).toHaveLength(0);
    expect(await listActiveCampaignKeywords(pool, tenantB.id)).toHaveLength(0);
    expect(await listActiveCampaignKeywords(pool, tenantA.id)).toHaveLength(1);
  });

  it("captured facts merged under tenant A are invisible to tenant B even for the same lead id shape", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-1");

    await mergeCapturedFacts(pool, tenantA.id, leadA.id, { email: "a@b.com" });

    expect(await getCapturedFacts(pool, tenantA.id, leadA.id)).toEqual({ email: "a@b.com" });
    // Querying the same lead id under the wrong tenant returns nothing —
    // there is no cross-tenant leak even though the row exists.
    expect(await getCapturedFacts(pool, tenantB.id, leadA.id)).toEqual({});
  });

  it("the same instagram_user_id under two tenants resolves to two distinct, mutually invisible leads", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");

    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-shared");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenantB.id, "ig-user-shared");

    expect(leadA.id).not.toBe(leadB.id);
    expect(await getLead(pool, tenantA.id, leadB.id)).toBeNull();
    expect(await getLead(pool, tenantB.id, leadA.id)).toBeNull();
  });
});
