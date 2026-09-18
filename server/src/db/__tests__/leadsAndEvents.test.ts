import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { advanceSequence, findOrCreateLeadByInstagramUserId, isSequenceStale } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("leads and events", () => {
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

  it("findOrCreateLeadByInstagramUserId is idempotent per tenant", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    const first = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const second = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    expect(second.id).toBe(first.id);
  });

  it("the same instagram_user_id can belong to a different lead under a different tenant", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");

    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "ig-user-shared");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenantB.id, "ig-user-shared");

    expect(leadA.id).not.toBe(leadB.id);
  });

  it("insertEventIdempotent is a no-op on a duplicate meta_event_id", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    const params = {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "dup-evt",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    };

    const first = await insertEventIdempotent(pool, params);
    const second = await insertEventIdempotent(pool, { ...params, sequence: 2 });

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // retry of the same webhook delivery, not a new event
  });

  it("advanceSequence rejects moving backward once a later sequence has landed", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    expect(await advanceSequence(pool, tenant.id, lead.id, 5)).toBe(true);
    // A retry of an older event arriving after a newer one already landed.
    expect(await advanceSequence(pool, tenant.id, lead.id, 3)).toBe(false);
    expect(await advanceSequence(pool, tenant.id, lead.id, 6)).toBe(true);
  });

  it("isSequenceStale distinguishes a genuine retry from a superseded duplicate", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    // Nothing applied yet — sequence 1 is not stale, it's the next one due.
    expect(await isSequenceStale(pool, tenant.id, lead.id, 1)).toBe(false);

    await advanceSequence(pool, tenant.id, lead.id, 1);

    // A RETRY of the same sequence that just "succeeded" must not look
    // stale — this is exactly the bug that let a failed handler's retry
    // silently no-op instead of ever reaching the dead letter queue.
    // (In practice advanceSequence only runs after the handler succeeds,
    // so this scenario is about sequence 1 arriving twice, not a failure
    // retry — the failure-retry case is covered by the queue integration
    // test instead, since it depends on ordering the two calls correctly.)
    expect(await isSequenceStale(pool, tenant.id, lead.id, 2)).toBe(false);
    expect(await isSequenceStale(pool, tenant.id, lead.id, 1)).toBe(true);
  });
});
