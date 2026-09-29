import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { listFieldDefinitions } from "../../db/fieldDefinitions.js";
import { listCampaigns } from "../../db/campaigns.js";
import { listMilestones } from "../../db/milestones.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";

describe("onboarding routes (R5)", () => {
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

  it("a fresh tenant has industry: null", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app).get(`/tenants/${tenant.id}`).set(authHeader);
    expect(res.body.industry).toBeNull();
  });

  it("apply-industry rejects an invalid industry", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app)
      .post(`/tenants/${tenant.id}/onboarding/apply-industry`)
      .set(authHeader)
      .send({ industry: "bogus" });
    expect(res.status).toBe(400);
  });

  it("apply-industry('real_estate') persists the industry and scaffolds the starter field definitions + campaign + milestones", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app)
      .post(`/tenants/${tenant.id}/onboarding/apply-industry`)
      .set(authHeader)
      .send({ industry: "real_estate" });
    expect(res.status).toBe(200);
    expect(res.body.industry).toBe("real_estate");

    const fields = await listFieldDefinitions(pool, tenant.id);
    expect(fields.map((f) => f.fieldKey).sort()).toEqual(["budget", "configuration", "location", "timeline"]);

    const campaigns = await listCampaigns(pool, tenant.id);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({ name: "Property Enquiry", keywords: ["PRICE", "DETAILS"] });

    const milestones = await listMilestones(pool, tenant.id, campaigns[0]!.id);
    expect(milestones).toHaveLength(4);
    expect(milestones[1]).toMatchObject({ captureFields: ["budget", "location"] });
  });

  it("apply-industry('other') persists the industry but scaffolds nothing", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app)
      .post(`/tenants/${tenant.id}/onboarding/apply-industry`)
      .set(authHeader)
      .send({ industry: "other" });
    expect(res.status).toBe(200);
    expect(res.body.industry).toBe("other");

    expect(await listFieldDefinitions(pool, tenant.id)).toEqual([]);
    expect(await listCampaigns(pool, tenant.id)).toEqual([]);
  });

  it("apply-industry does not duplicate a field definition the tenant already registered under the same key", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    await request(app)
      .post(`/tenants/${tenant.id}/field-definitions`)
      .set(authHeader)
      .send({ fieldKey: "budget", label: "My Own Budget Label", valueType: "text" });

    await request(app).post(`/tenants/${tenant.id}/onboarding/apply-industry`).set(authHeader).send({ industry: "real_estate" });

    const fields = await listFieldDefinitions(pool, tenant.id);
    const budgetFields = fields.filter((f) => f.fieldKey === "budget");
    expect(budgetFields).toHaveLength(1);
    expect(budgetFields[0]!.label).toBe("My Own Budget Label"); // pre-existing definition wins, untouched
  });
});
