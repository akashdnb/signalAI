import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { createScoringRule, listScoringRules } from "../../db/leadScoringRules.js";
import { createCampaign } from "../../db/campaigns.js";
import { setCampaignMilestones } from "../../db/milestones.js";
import { getBoss, stopBoss } from "../../queue/boss.js";
import { ensureTenantScoringRefreshQueue, TENANT_SCORING_REFRESH_QUEUE } from "../../queue/tenantScoringRefreshQueue.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

/**
 * Simulates an enqueue failure deterministically (no mocking of pg-boss
 * internals): deleting the queue itself makes boss.send() throw "Queue ...
 * does not exist", the exact failure mode a transactional mutation must
 * survive without persisting. Same technique
 * webhookIngestService.newLead.test.ts already uses for the lead-events
 * queue (boss.deleteQueue, not a raw DELETE — the queue table has FK'd job
 * rows). Must be restored before the next test runs (see afterEach below).
 */
async function dropTenantScoringRefreshQueue(): Promise<void> {
  const boss = await getBoss();
  await boss.deleteQueue(TENANT_SCORING_REFRESH_QUEUE);
}

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

  afterEach(async () => {
    // Restore the queue regardless of what a test above did to it, so a
    // later test (in this file or run after it) never observes a dropped
    // queue it didn't itself set up.
    await ensureTenantScoringRefreshQueue(await getBoss());
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

  describe("strict boolean validation for `enabled`", () => {
    async function post(tenantId: string, authHeader: Record<string, string>, enabled: unknown) {
      const app = createApp();
      return request(app)
        .post(`/tenants/${tenantId}/scoring-rules`)
        .set(authHeader)
        .send({ name: "Rule", definition: { kind: "field_compare", field: "location", operator: "exists" }, points: 5, enabled });
    }

    it("accepts true", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const res = await post(tenant.id, authHeader, true);
      expect(res.status).toBe(201);
      expect(res.body.rule.enabled).toBe(true);
    });

    it("accepts false", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const res = await post(tenant.id, authHeader, false);
      expect(res.status).toBe(201);
      expect(res.body.rule.enabled).toBe(false);
    });

    it('rejects the string "false" rather than treating it as JS-truthy', async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const res = await post(tenant.id, authHeader, "false");
      expect(res.status).toBe(400);
    });

    it('rejects the string "true"', async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const res = await post(tenant.id, authHeader, "true");
      expect(res.status).toBe(400);
    });

    it("rejects 0", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const res = await post(tenant.id, authHeader, 0);
      expect(res.status).toBe(400);
    });

    it("rejects 1", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const res = await post(tenant.id, authHeader, 1);
      expect(res.status).toBe(400);
    });

    it("rejects null", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const res = await post(tenant.id, authHeader, null);
      expect(res.status).toBe(400);
    });

    it("omitted on POST defaults to true", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const app = createApp();
      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({ name: "Rule", definition: { kind: "field_compare", field: "location", operator: "exists" }, points: 5 });
      expect(res.body.rule.enabled).toBe(true);
    });

    it("omitted on PATCH leaves the existing value unchanged", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const rule = await createScoringRule(pool, tenant.id, {
        name: "Rule",
        definition: { kind: "field_compare", field: "location", operator: "exists" },
        points: 5,
        enabled: false,
      });
      const app = createApp();
      const res = await request(app).patch(`/tenants/${tenant.id}/scoring-rules/${rule.id}`).set(authHeader).send({ points: 9 });
      expect(res.status).toBe(200);
      expect(res.body.rule.enabled).toBe(false);
    });
  });

  describe("milestone ownership validation", () => {
    it("accepts a milestone_completed rule referencing a same-tenant milestone", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
      const [milestone] = await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "ask for budget" }]);

      const app = createApp();
      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({ name: "Reached milestone", definition: { kind: "milestone_completed", milestoneId: milestone!.id }, points: 5 });

      expect(res.status).toBe(201);
    });

    it("rejects a nonexistent milestone id with 400", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const app = createApp();
      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({
          name: "Reached milestone",
          definition: { kind: "milestone_completed", milestoneId: "123e4567-e89b-12d3-a456-426614174000" },
          points: 5,
        });

      expect(res.status).toBe(400);
      expect(await listScoringRules(pool, tenant.id)).toEqual([]);
    });

    it("rejects a milestone belonging to a DIFFERENT tenant with 400, never storing a cross-tenant reference", async () => {
      const pool = getPool();
      const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const { tenant: tenantB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
      const campaignB = await createCampaign(pool, tenantB.id, "Giveaway", ["LINK"]);
      const [milestoneB] = await setCampaignMilestones(pool, tenantB.id, campaignB.id, [{ goalDescription: "ask for budget" }]);

      const app = createApp();
      const res = await request(app)
        .post(`/tenants/${tenantA.id}/scoring-rules`)
        .set(authA)
        .send({ name: "Cross-tenant", definition: { kind: "milestone_completed", milestoneId: milestoneB!.id }, points: 5 });

      expect(res.status).toBe(400);
      expect(await listScoringRules(pool, tenantA.id)).toEqual([]);
    });

    it("rejects a soft-deleted milestone with 400", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const campaign = await createCampaign(pool, tenant.id, "Giveaway", ["LINK"]);
      const [milestone] = await setCampaignMilestones(pool, tenant.id, campaign.id, [{ goalDescription: "ask for budget" }]);
      await setCampaignMilestones(pool, tenant.id, campaign.id, []); // soft-deletes the one above

      const app = createApp();
      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({ name: "Deleted milestone", definition: { kind: "milestone_completed", milestoneId: milestone!.id }, points: 5 });

      expect(res.status).toBe(400);
    });
  });

  describe("transactional mutation + refresh enqueue", () => {
    it("rolls back the create when the refresh enqueue fails — no orphan rule, no orphan queue job", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      await dropTenantScoringRefreshQueue();

      const app = createApp();
      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({ name: "Should not persist", definition: { kind: "field_compare", field: "location", operator: "exists" }, points: 5 });

      expect(res.status).toBe(500);
      expect(await listScoringRules(pool, tenant.id)).toEqual([]);
    });

    it("rolls back the update when the refresh enqueue fails — the rule's prior state is preserved", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const rule = await createScoringRule(pool, tenant.id, {
        name: "Original",
        definition: { kind: "field_compare", field: "location", operator: "exists" },
        points: 5,
      });

      await dropTenantScoringRefreshQueue();

      const app = createApp();
      const res = await request(app).patch(`/tenants/${tenant.id}/scoring-rules/${rule.id}`).set(authHeader).send({ points: 99 });

      expect(res.status).toBe(500);
      const [stored] = await listScoringRules(pool, tenant.id);
      expect(stored!.points).toBe(5); // unchanged — the update rolled back
    });

    it("rolls back the delete when the refresh enqueue fails — the rule still exists afterward", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      const rule = await createScoringRule(pool, tenant.id, {
        name: "Should survive",
        definition: { kind: "field_compare", field: "location", operator: "exists" },
        points: 5,
      });

      await dropTenantScoringRefreshQueue();

      const app = createApp();
      const res = await request(app).delete(`/tenants/${tenant.id}/scoring-rules/${rule.id}`).set(authHeader);

      expect(res.status).toBe(500);
      expect(await listScoringRules(pool, tenant.id)).toHaveLength(1);
      expect((await listScoringRules(pool, tenant.id))[0]!.id).toBe(rule.id);
    });

    it("succeeds normally (create + enqueue both commit) once the queue is restored", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
      // afterEach always restores the queue, but assert the happy path
      // explicitly here too — this is the behavior every other test in
      // this file already relies on implicitly.
      const app = createApp();
      const res = await request(app)
        .post(`/tenants/${tenant.id}/scoring-rules`)
        .set(authHeader)
        .send({ name: "Commits normally", definition: { kind: "field_compare", field: "location", operator: "exists" }, points: 5 });

      expect(res.status).toBe(201);
      expect(await listScoringRules(pool, tenant.id)).toHaveLength(1);

      const jobRows = await pool.query<{ data: { tenantId: string } }>(`select data from pgboss.job where name = $1`, [
        TENANT_SCORING_REFRESH_QUEUE,
      ]);
      expect(jobRows.rows.some((r) => r.data.tenantId === tenant.id)).toBe(true);
    });
  });
});
