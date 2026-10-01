import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { mergeCapturedFacts } from "../../db/capturedFacts.js";
import { recalculateLeadIntelligence } from "../../services/leadScoring.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";

describe("lead intelligence routes (Phase 2C)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
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

  describe("GET /tenants/:tenantId/leads/:leadId/intelligence", () => {
    it("401s with no session", async () => {
      const pool = getPool();
      const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
      const app = createApp();

      const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/intelligence`);
      expect(res.status).toBe(401);
    });

    it("403s a session for a different tenant entirely (not a member)", async () => {
      const pool = getPool();
      const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const { authHeader: authB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
      const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
      const app = createApp();

      const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/intelligence`).set(authB);
      expect(res.status).toBe(403);
    });

    it("404s when the lead belongs to a different tenant than the one in the URL (cross-tenant denial)", async () => {
      const pool = getPool();
      const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const { tenant: tenantB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
      const leadB = await findOrCreateLeadByInstagramUserId(pool, tenantB.id, "ig-user-1");
      const app = createApp();

      // authA is a genuine member of tenantA, so requireTenantSession
      // passes — the cross-tenant protection must come from the lead
      // lookup itself being scoped to tenantId, not from auth alone.
      const res = await request(app).get(`/tenants/${tenantA.id}/leads/${leadB.id}/intelligence`).set(authA);
      expect(res.status).toBe(404);
    });

    it("404s when the lead does not exist at all", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const app = createApp();

      const res = await request(app).get(`/tenants/${tenant.id}/leads/00000000-0000-0000-0000-000000000000/intelligence`).set(authHeader);
      expect(res.status).toBe(404);
    });

    it("returns null when nothing has been calculated yet (not an error)", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
      const app = createApp();

      const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/intelligence`).set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it("returns the current projection for a same-tenant, authenticated request", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
      await mergeCapturedFacts(pool, tenant.id, lead.id, { intent: "ready_to_buy", need: "3BHK apartment", budget: "₹1.5 crore", location: "Bangalore" });
      await recalculateLeadIntelligence(pool, tenant.id, lead.id);

      const app = createApp();
      const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/intelligence`).set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ intent: "ready_to_buy", score: 75, scoreBand: "hot" });
    });
  });

  describe("GET /tenants/:tenantId/leads/:leadId/intelligence/history", () => {
    it("404s for a lead belonging to a different tenant", async () => {
      const pool = getPool();
      const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const { tenant: tenantB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
      const leadB = await findOrCreateLeadByInstagramUserId(pool, tenantB.id, "ig-user-1");
      const app = createApp();

      const res = await request(app).get(`/tenants/${tenantA.id}/leads/${leadB.id}/intelligence/history`).set(authA);
      expect(res.status).toBe(404);
    });

    it("returns history entries for a same-tenant request", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
      await mergeCapturedFacts(pool, tenant.id, lead.id, { intent: "ready_to_buy" });
      await recalculateLeadIntelligence(pool, tenant.id, lead.id);

      const app = createApp();
      const res = await request(app).get(`/tenants/${tenant.id}/leads/${lead.id}/intelligence/history`).set(authHeader);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe("POST /tenants/:tenantId/leads/:leadId/intelligence/recalculate", () => {
    it("404s for a lead belonging to a different tenant, without recalculating anything", async () => {
      const pool = getPool();
      const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const { tenant: tenantB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
      const leadB = await findOrCreateLeadByInstagramUserId(pool, tenantB.id, "ig-user-1");
      const app = createApp();

      const res = await request(app).post(`/tenants/${tenantA.id}/leads/${leadB.id}/intelligence/recalculate`).set(authA);
      expect(res.status).toBe(404);
    });

    it("recalculates and returns the refreshed projection for a same-tenant request", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
      await mergeCapturedFacts(pool, tenant.id, lead.id, { intent: "ready_to_buy", need: "3BHK apartment" });

      const app = createApp();
      const res = await request(app).post(`/tenants/${tenant.id}/leads/${lead.id}/intelligence/recalculate`).set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body.intent).toBe("ready_to_buy");
    });
  });
});
