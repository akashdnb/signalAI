import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { addLeadNote, listLeadNotes } from "../leadNotes.js";
import { listLeadActivity } from "../leadActivity.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("lead notes", () => {
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

  it("adds a note and lists it back newest-first, alongside a matching lead_activity entry", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");

    await addLeadNote(pool, { tenantId: tenant.id, leadId: lead.id, authorUserId: owner.id, body: "Called, left voicemail" });
    await addLeadNote(pool, { tenantId: tenant.id, leadId: lead.id, authorUserId: owner.id, body: "Follow up tomorrow" });

    const notes = await listLeadNotes(pool, tenant.id, lead.id);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.body).toBe("Follow up tomorrow"); // newest first

    const activity = await listLeadActivity(pool, tenant.id, lead.id);
    expect(activity.filter((a) => a.type === "note_added")).toHaveLength(2);
  });

  it("a note commits atomically with its activity entry — both present, or (on a bad lead id) neither", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    await expect(
      addLeadNote(pool, { tenantId: tenant.id, leadId: "00000000-0000-0000-0000-000000000000", authorUserId: owner.id, body: "orphan" }),
    ).rejects.toThrow();

    const count = await pool.query("select count(*) from lead_notes");
    expect(Number(count.rows[0]!.count)).toBe(0);
  });
});
