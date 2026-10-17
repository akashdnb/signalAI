import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";

const SESSION_SECRET = "test-session-secret";

describe("analytics post lead filtering", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
  });
  beforeEach(async () => { await resetDb(getPool()); });
  afterAll(async () => { await closePool(); });

  it("returns only same-tenant leads with an exact comment event for the selected post", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "post-filter-owner");
    const { tenant: otherTenant } = await createLoggedInTenant(pool, SESSION_SECRET, "post-filter-other");
    const postLead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "post-filter-lead");
    const otherLead = await findOrCreateLeadByInstagramUserId(pool, otherTenant.id, "post-filter-other-lead");
    await insertEventIdempotent(pool, { tenantId: tenant.id, leadId: postLead.id, metaEventId: "post-filter-comment-1", eventType: "comment", occurredAt: new Date(), sequence: 1, attributes: { mediaId: "post-filter-media" } });
    await insertEventIdempotent(pool, { tenantId: tenant.id, leadId: postLead.id, metaEventId: "post-filter-comment-2", eventType: "comment", occurredAt: new Date(), sequence: 2, attributes: { mediaId: "post-filter-media" } });
    await insertEventIdempotent(pool, { tenantId: tenant.id, leadId: postLead.id, metaEventId: "post-filter-message", eventType: "message", occurredAt: new Date(), sequence: 3, attributes: { mediaId: "post-filter-media" } });
    await insertEventIdempotent(pool, { tenantId: otherTenant.id, leadId: otherLead.id, metaEventId: "post-filter-other-comment", eventType: "comment", occurredAt: new Date(), sequence: 1, attributes: { mediaId: "post-filter-media" } });
    const app = createApp();
    const filtered = await request(app).get(`/tenants/${tenant.id}/leads?sourceMediaId=post-filter-media&page=1&pageSize=20`).set(authHeader);
    expect(filtered.status).toBe(200); expect(filtered.body.total).toBe(1); expect(filtered.body.items.map((lead: { id: string }) => lead.id)).toEqual([postLead.id]);
    const empty = await request(app).get(`/tenants/${tenant.id}/leads?sourceMediaId=missing-media&page=1&pageSize=20`).set(authHeader);
    expect(empty.status).toBe(200); expect(empty.body.total).toBe(0); expect(empty.body.items).toEqual([]);
  });
});
