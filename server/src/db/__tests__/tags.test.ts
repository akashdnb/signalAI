import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { findOrCreateTag, listTagsForTenant, listTagsForLead, addTagToLead, removeTagFromLead } from "../tags.js";
import { listLeadActivity } from "../leadActivity.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("tags", () => {
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

  it("findOrCreateTag is idempotent per (tenant, name)", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    const first = await findOrCreateTag(pool, tenant.id, "hot lead");
    const second = await findOrCreateTag(pool, tenant.id, "hot lead");
    expect(second.id).toBe(first.id);

    const all = await listTagsForTenant(pool, tenant.id);
    expect(all).toHaveLength(1);
  });

  it("addTagToLead attaches a tag and records activity; is a no-op (no duplicate activity) if already attached", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const tag = await findOrCreateTag(pool, tenant.id, "hot lead");

    await addTagToLead(pool, { tenantId: tenant.id, leadId: lead.id, tagId: tag.id, tagName: tag.name, actorUserId: owner.id });
    await addTagToLead(pool, { tenantId: tenant.id, leadId: lead.id, tagId: tag.id, tagName: tag.name, actorUserId: owner.id });

    const tagsOnLead = await listTagsForLead(pool, tenant.id, lead.id);
    expect(tagsOnLead).toHaveLength(1);

    const activity = await listLeadActivity(pool, tenant.id, lead.id);
    expect(activity.filter((a) => a.type === "tag_added")).toHaveLength(1); // second call was a no-op
  });

  it("removeTagFromLead detaches a tag and records activity", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const tag = await findOrCreateTag(pool, tenant.id, "hot lead");
    await addTagToLead(pool, { tenantId: tenant.id, leadId: lead.id, tagId: tag.id, tagName: tag.name });

    await removeTagFromLead(pool, { tenantId: tenant.id, leadId: lead.id, tagId: tag.id, tagName: tag.name, actorUserId: owner.id });

    expect(await listTagsForLead(pool, tenant.id, lead.id)).toHaveLength(0);
    const activity = await listLeadActivity(pool, tenant.id, lead.id);
    expect(activity.filter((a) => a.type === "tag_removed")).toHaveLength(1);
  });

  it("the same tag name can exist independently under two different tenants", async () => {
    const pool = getPool();
    const ownerA = await findOrCreateUserByEmail(pool, "a@example.com");
    const tenantA = await createTenantForUser(pool, "creator-a", ownerA.id);
    const ownerB = await findOrCreateUserByEmail(pool, "b@example.com");
    const tenantB = await createTenantForUser(pool, "creator-b", ownerB.id);

    const tagA = await findOrCreateTag(pool, tenantA.id, "hot lead");
    const tagB = await findOrCreateTag(pool, tenantB.id, "hot lead");
    expect(tagA.id).not.toBe(tagB.id);
  });
});
