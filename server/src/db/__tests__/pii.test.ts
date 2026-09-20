import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { insertPii, hasKnownUsername, backfillLeadPiiUsername } from "../pii.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("pii — username enrichment (comment vs. DM leads)", () => {
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

  async function seedEventWithoutUsername(pool: ReturnType<typeof getPool>, tenantId: string, leadId: string) {
    const event = await insertEventIdempotent(pool, {
      tenantId,
      leadId,
      metaEventId: `evt-${Math.random()}`,
      eventType: "message",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, { tenantId, leadEventId: event!.id, leadId, dmText: "hi" }); // no username — a DM event
    return event!;
  }

  it("hasKnownUsername is false until some event supplies one", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    await seedEventWithoutUsername(pool, tenant.id, lead.id);

    expect(await hasKnownUsername(pool, tenant.id, lead.id)).toBe(false);
  });

  it("backfillLeadPiiUsername fills a null username and hasKnownUsername then reports true", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await seedEventWithoutUsername(pool, tenant.id, lead.id);

    await backfillLeadPiiUsername(pool, tenant.id, event.id, "resolved_handle");

    expect(await hasKnownUsername(pool, tenant.id, lead.id)).toBe(true);
    const row = await pool.query("select username from lead_pii where lead_event_id = $1", [event.id]);
    expect(row.rows[0].username).toBe("resolved_handle");
  });

  it("backfillLeadPiiUsername never overwrites a username an event already had", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-with-username",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, username: "original_handle" });

    await backfillLeadPiiUsername(pool, tenant.id, event!.id, "should_not_stick");

    const row = await pool.query("select username from lead_pii where lead_event_id = $1", [event!.id]);
    expect(row.rows[0].username).toBe("original_handle");
  });

  it("hasKnownUsername ignores a soft-deleted lead_pii row", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-deleted",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, { tenantId: tenant.id, leadEventId: event!.id, leadId: lead.id, username: "erased_handle" });
    await pool.query("update lead_pii set username = null, deleted_at = now() where lead_event_id = $1", [event!.id]);

    expect(await hasKnownUsername(pool, tenant.id, lead.id)).toBe(false);
  });
});
