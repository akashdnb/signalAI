import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { createScoringRule } from "../../db/leadScoringRules.js";
import { getBoss, stopBoss } from "../../queue/boss.js";
import { ensureTenantScoringRefreshQueue } from "../../queue/tenantScoringRefreshQueue.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";

describe("lead scoring rules routes (SLICE C)", () => {
  beforeAll(async () => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
    // The route enqueues a tenant scoring refresh (Objective B) on every
    // mutation — boss.send() requires the queue to exist first, same as
    // every other queue in this codebase.
    await ensureTenantScoringRefreshQueue(await getBoss());
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await stopBoss();
    await closePool();
  });

  describe("GET /tenants/:tenantId/scoring-rules", () => {
    it("401s with no session", async () => {
      const pool = getPool();
      const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const app = createApp();

      const res = await request(app).get(`/tenants/${tenant.id}/scoring-rules`);
      expect(res.status).toBe(401);
    });

    it("403s a non-member session", async () => {
      const pool = getPool();
      const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const { authHeader: authB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
      const app = createApp();

      const res = await request(app).get(`/tenants/${tenant.id}/scoring-rules`).set(authB);
      expect(res.status).toBe(403);
    });

    it("never returns another tenant's rules", async () => {
      const pool = getPool();
      const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const { tenant: tenantB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");

      await createScoringRule(pool, tenantB.id, {
        name: "Tenant B's rule",
        definition: { kind: "field_compare", field: "location", operator: "exists" },
        points: 5,
      });

      const app = createApp();
      const res = await request(app).get(`/tenants/${tenantA.id}/scoring-rules`).set(authA);
      expect(res.status).toBe(200);
      expect(res.body.rules).toEqual([]);
    });
  });

  describe("POST /tenants/:tenantId/scoring-rules", () => {
    it("creates a valid rule", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const app = createApp();

      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({
          name: "Big budget bonus",
          definition: { kind: "field_compare", field: "budget_value", operator: "gte", value: 10000000 },
          points: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.rule).toMatchObject({ name: "Big budget bonus", points: 10, enabled: true });
    });

    it("rejects a malformed rule with 400, not 500", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const app = createApp();

      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({
          name: "Bad rule",
          definition: { kind: "field_compare", field: "location", operator: "gte", value: "Bangalore" },
          points: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("rejects points outside -100..100", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const app = createApp();

      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({
          name: "Too much",
          definition: { kind: "field_compare", field: "location", operator: "exists" },
          points: 500,
        });

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH and DELETE /tenants/:tenantId/scoring-rules/:id", () => {
    it("404s a patch/delete for a rule belonging to a different tenant", async () => {
      const pool = getPool();
      const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const { tenant: tenantB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");

      const rule = await createScoringRule(pool, tenantB.id, {
        name: "Tenant B's rule",
        definition: { kind: "field_compare", field: "location", operator: "exists" },
        points: 5,
      });

      const app = createApp();
      const patchRes = await request(app).patch(`/tenants/${tenantA.id}/scoring-rules/${rule.id}`).set(authA).send({ points: 1 });
      expect(patchRes.status).toBe(404);

      const deleteRes = await request(app).delete(`/tenants/${tenantA.id}/scoring-rules/${rule.id}`).set(authA);
      expect(deleteRes.status).toBe(404);
    });

    it("enables/disables and deletes a same-tenant rule", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const rule = await createScoringRule(pool, tenant.id, {
        name: "Reached pricing milestone",
        definition: { kind: "field_compare", field: "location", operator: "exists" },
        points: 5,
      });
      const app = createApp();

      const disableRes = await request(app).patch(`/tenants/${tenant.id}/scoring-rules/${rule.id}`).set(authHeader).send({ enabled: false });
      expect(disableRes.status).toBe(200);
      expect(disableRes.body.rule.enabled).toBe(false);

      const deleteRes = await request(app).delete(`/tenants/${tenant.id}/scoring-rules/${rule.id}`).set(authHeader);
      expect(deleteRes.status).toBe(204);
    });
  });
});
