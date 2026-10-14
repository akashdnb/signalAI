import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import { getWorkspaceCoverage } from "../../db/billingAccounts.js";

const SESSION_SECRET = "test-session-secret";

const mockCheckoutCreate = vi.fn();
const mockConstructEvent = vi.fn();

vi.mock("../../lib/stripeClient.js", () => ({
  isBillingConfigured: vi.fn(() => true),
  getStripeClient: vi.fn(() => ({
    checkout: { sessions: { create: mockCheckoutCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  })),
}));

/** Creates another workspace owned by the authenticated caller, returns its id. */
async function createOwnedWorkspace(app: ReturnType<typeof createApp>, authHeader: Record<string, string>, name: string) {
  const res = await request(app).post("/workspaces").set(authHeader).send({ name });
  return res.body.workspace.tenantId as string;
}

describe("agency billing-account routes", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_PRICE_ID = "price_test_starter";
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table stripe_webhook_events");
    mockCheckoutCreate.mockReset();
    mockConstructEvent.mockReset();
    delete process.env.STRIPE_AGENCY_PRICE_ID;
  });

  afterEach(() => {
    delete process.env.STRIPE_AGENCY_PRICE_ID;
  });

  afterAll(async () => {
    await closePool();
  });

  describe("create + fetch", () => {
    it("creates one plan per owner and rejects a second", async () => {
      const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();

      const created = await request(app).post("/billing-accounts").set(authHeader).send({ workspaceLimit: 5 });
      expect(created.status).toBe(201);
      expect(created.body.billingAccount).toMatchObject({ workspaceLimit: 5, billingStatus: "none", plan: "agency_bulk" });

      const second = await request(app).post("/billing-accounts").set(authHeader).send({});
      expect(second.status).toBe(409);
    });

    it("rejects an invalid workspaceLimit", async () => {
      const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const res = await request(createApp()).post("/billing-accounts").set(authHeader).send({ workspaceLimit: 0 });
      expect(res.status).toBe(400);
    });

    it("GET /me/billing-account returns null, then the plan detail", async () => {
      const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();

      const before = await request(app).get("/me/billing-account").set(authHeader);
      expect(before.body.billingAccount).toBeNull();

      await request(app).post("/billing-accounts").set(authHeader).send({ workspaceLimit: 3 });
      const after = await request(app).get("/me/billing-account").set(authHeader);
      expect(after.body.billingAccount).toMatchObject({ workspaceLimit: 3 });
      expect(after.body.pool).toBeDefined();
      expect(after.body.workspaces).toEqual([]);
    });

    it("hides another user's plan behind a 404", async () => {
      const { authHeader: ownerAuth } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Owner");
      const { authHeader: strangerAuth } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Stranger");
      const app = createApp();

      const created = await request(app).post("/billing-accounts").set(ownerAuth).send({});
      const id = created.body.billingAccount.id;

      expect((await request(app).get(`/billing-accounts/${id}`).set(strangerAuth)).status).toBe(404);
    });
  });

  describe("covering workspaces", () => {
    it("adds a workspace the caller owns, enforces the limit, and blocks double-coverage", async () => {
      const { authHeader, tenant } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(authHeader).send({ workspaceLimit: 1 });
      const id = created.body.billingAccount.id;

      const add1 = await request(app).post(`/billing-accounts/${id}/workspaces/${tenant.id}`).set(authHeader);
      expect(add1.status).toBe(201);
      expect(await getWorkspaceCoverage(getPool(), tenant.id)).toMatchObject({ billingAccountId: id });

      // Adding the same workspace again → already covered.
      expect((await request(app).post(`/billing-accounts/${id}/workspaces/${tenant.id}`).set(authHeader)).status).toBe(409);

      // A second owned workspace exceeds the limit of 1.
      const ws2 = await createOwnedWorkspace(app, authHeader, "WS2");
      expect((await request(app).post(`/billing-accounts/${id}/workspaces/${ws2}`).set(authHeader)).status).toBe(409);
    });

    it("refuses to cover a workspace the caller does not own", async () => {
      const { authHeader: agencyAuth } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const { tenant: foreign } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Foreign");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(agencyAuth).send({});
      const id = created.body.billingAccount.id;

      const res = await request(app).post(`/billing-accounts/${id}/workspaces/${foreign.id}`).set(agencyAuth);
      expect(res.status).toBe(403);
    });

    it("sets and clears a per-workspace token cap, and removes a workspace", async () => {
      const { authHeader, tenant } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(authHeader).send({});
      const id = created.body.billingAccount.id;
      await request(app).post(`/billing-accounts/${id}/workspaces/${tenant.id}`).set(authHeader);

      const capped = await request(app)
        .patch(`/billing-accounts/${id}/workspaces/${tenant.id}`)
        .set(authHeader)
        .send({ perWorkspaceTokenCap: 40_000 });
      expect(capped.status).toBe(200);
      expect(capped.body.workspaces[0].perWorkspaceTokenCap).toBe(40_000);

      const removed = await request(app).delete(`/billing-accounts/${id}/workspaces/${tenant.id}`).set(authHeader);
      expect(removed.status).toBe(200);
      expect(await getWorkspaceCoverage(getPool(), tenant.id)).toBeNull();
    });
  });

  describe("checkout", () => {
    it("503 when the agency price is not configured", async () => {
      const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(authHeader).send({});
      const id = created.body.billingAccount.id;

      const res = await request(app).post(`/billing-accounts/${id}/checkout`).set(authHeader);
      expect(res.status).toBe(503);
    });

    it("returns the Stripe Checkout URL when configured", async () => {
      process.env.STRIPE_AGENCY_PRICE_ID = "price_agency";
      mockCheckoutCreate.mockResolvedValue({ url: "https://stripe.test/checkout/abc" });
      const { authHeader, tenant } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(authHeader).send({});
      const id = created.body.billingAccount.id;
      await request(app).post(`/billing-accounts/${id}/workspaces/${tenant.id}`).set(authHeader);

      const res = await request(app).post(`/billing-accounts/${id}/checkout`).set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body.url).toBe("https://stripe.test/checkout/abc");
      // quantity = covered count (1), referenced as a billing account.
      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "subscription",
          client_reference_id: `ba:${id}`,
          line_items: [expect.objectContaining({ price: "price_agency", quantity: 1 })],
        }),
      );
    });
  });

  describe("checkout guard + plan-covered /usage", () => {
    async function activatePlan(app: ReturnType<typeof createApp>, id: string, customer: string, sub: string) {
      mockConstructEvent.mockReturnValue({
        id: `evt_${sub}`,
        type: "checkout.session.completed",
        data: { object: { client_reference_id: `ba:${id}`, customer, subscription: sub } },
      });
      await request(app).post("/billing/webhook").set("stripe-signature", "s").set("Content-Type", "application/json").send(Buffer.from("{}"));
    }

    it("refuses a second checkout while the plan is already active", async () => {
      process.env.STRIPE_AGENCY_PRICE_ID = "price_agency";
      const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(authHeader).send({});
      const id = created.body.billingAccount.id;
      await activatePlan(app, id, "cus_live", "sub_live");

      const res = await request(app).post(`/billing-accounts/${id}/checkout`).set(authHeader);
      expect(res.status).toBe(409);
      expect(mockCheckoutCreate).not.toHaveBeenCalled();
    });

    it("/usage reports the cap as the allowance for a capped covered workspace, and null when uncapped", async () => {
      const { authHeader, tenant } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(authHeader).send({});
      const id = created.body.billingAccount.id;
      await request(app).post(`/billing-accounts/${id}/workspaces/${tenant.id}`).set(authHeader);
      await activatePlan(app, id, "cus_u", "sub_u");

      // Uncapped: allowance is null (the shared pool is not this one workspace's).
      let usage = await request(app).get(`/tenants/${tenant.id}/usage`).set(authHeader);
      expect(usage.status).toBe(200);
      expect(usage.body.billingSource).toBe("plan");
      expect(usage.body.tokens.allowance).toBeNull();
      expect(usage.body.tokens.nearingLimit).toBe(false);

      // Capped: the cap becomes the per-workspace allowance.
      await request(app).patch(`/billing-accounts/${id}/workspaces/${tenant.id}`).set(authHeader).send({ perWorkspaceTokenCap: 30_000 });
      usage = await request(app).get(`/tenants/${tenant.id}/usage`).set(authHeader);
      expect(usage.body.tokens.allowance).toBe(30_000);
      expect(usage.body.tokens.perWorkspaceTokenCap).toBe(30_000);
    });
  });

  describe("webhook activates and lapses a plan", () => {
    it("checkout.session.completed with a ba: reference activates the plan", async () => {
      const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(authHeader).send({});
      const id = created.body.billingAccount.id;

      mockConstructEvent.mockReturnValue({
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: { client_reference_id: `ba:${id}`, customer: "cus_agency", subscription: "sub_1" } },
      });

      const res = await request(app)
        .post("/billing/webhook")
        .set("stripe-signature", "sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from("{}"));
      expect(res.status).toBe(200);

      const detail = await request(app).get(`/billing-accounts/${id}`).set(authHeader);
      expect(detail.body.billingAccount.billingStatus).toBe("active");
    });

    it("subscription.updated past_due then deleted canceled", async () => {
      const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "Agency");
      const app = createApp();
      const created = await request(app).post("/billing-accounts").set(authHeader).send({});
      const id = created.body.billingAccount.id;

      // Activate first.
      mockConstructEvent.mockReturnValue({
        id: "evt_a",
        type: "checkout.session.completed",
        data: { object: { client_reference_id: `ba:${id}`, customer: "cus_x", subscription: "sub_x" } },
      });
      await request(app).post("/billing/webhook").set("stripe-signature", "s").set("Content-Type", "application/json").send(Buffer.from("{}"));

      mockConstructEvent.mockReturnValue({
        id: "evt_b",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_x", customer: "cus_x", status: "past_due" } },
      });
      await request(app).post("/billing/webhook").set("stripe-signature", "s").set("Content-Type", "application/json").send(Buffer.from("{}"));
      expect((await request(app).get(`/billing-accounts/${id}`).set(authHeader)).body.billingAccount.billingStatus).toBe("past_due");

      mockConstructEvent.mockReturnValue({
        id: "evt_c",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_x", customer: "cus_x" } },
      });
      await request(app).post("/billing/webhook").set("stripe-signature", "s").set("Content-Type", "application/json").send(Buffer.from("{}"));
      expect((await request(app).get(`/billing-accounts/${id}`).set(authHeader)).body.billingAccount.billingStatus).toBe("canceled");
    });
  });
});
