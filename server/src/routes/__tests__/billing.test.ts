import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant, getTenant } from "../../db/tenants.js";
import { resetDb } from "../../__tests__/helpers/db.js";

const mockCreate = vi.fn();
const mockConstructEvent = vi.fn();

vi.mock("../../lib/stripeClient.js", () => ({
  isBillingConfigured: vi.fn(() => true),
  getStripeClient: vi.fn(() => ({
    checkout: { sessions: { create: mockCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  })),
}));

import { isBillingConfigured } from "../../lib/stripeClient.js";

describe("billing routes (B11)", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  beforeEach(async () => {
    await resetDb(getPool());
    mockCreate.mockReset();
    mockConstructEvent.mockReset();
    vi.mocked(isBillingConfigured).mockReturnValue(true);
  });

  afterEach(() => {
    vi.mocked(isBillingConfigured).mockReturnValue(true);
  });

  afterAll(async () => {
    await closePool();
  });

  it("POST checkout returns 503 when billing isn't configured", async () => {
    vi.mocked(isBillingConfigured).mockReturnValue(false);
    const tenant = await createTenant(getPool(), "creator-a");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/billing/checkout`);
    expect(res.status).toBe(503);
  });

  it("POST checkout 404s for an unknown tenant", async () => {
    const app = createApp();
    const res = await request(app).post(`/tenants/00000000-0000-0000-0000-000000000000/billing/checkout`);
    expect(res.status).toBe(404);
  });

  it("POST checkout creates a Stripe Checkout session and returns its URL", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    mockCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" });
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/billing/checkout`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://checkout.stripe.com/session/abc" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "subscription", client_reference_id: tenant.id }),
    );
  });

  it("GET billing status reports none before checkout, and whether billing is configured", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const app = createApp();
    const res = await request(app).get(`/tenants/${tenant.id}/billing`);
    expect(res.body).toEqual({ billingStatus: "none", billingConfigured: true });
  });

  it("webhook rejects a request with no signature header", async () => {
    const app = createApp();
    const res = await request(app).post("/billing/webhook").send({ some: "payload" });
    expect(res.status).toBe(400);
  });

  it("webhook rejects an invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("signature mismatch");
    });
    const app = createApp();
    const res = await request(app)
      .post("/billing/webhook")
      .set("stripe-signature", "bad-sig")
      .send({ some: "payload" });
    expect(res.status).toBe(400);
  });

  it("checkout.session.completed activates billing for the referenced tenant", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: tenant.id,
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    const app = createApp();
    const res = await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});
    expect(res.status).toBe(200);

    const updated = await getTenant(getPool(), tenant.id);
    expect(updated).toMatchObject({
      billingStatus: "active",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
    });
  });

  it("customer.subscription.deleted cancels billing for the matching tenant", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: tenant.id, customer: "cus_456", subscription: "sub_456" } },
    });
    const app = createApp();
    await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});

    mockConstructEvent.mockReturnValueOnce({
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_456" } },
    });
    const res = await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});
    expect(res.status).toBe(200);

    const updated = await getTenant(pool, tenant.id);
    expect(updated!.billingStatus).toBe("canceled");
  });

  it("ignores event types it doesn't handle, without erroring", async () => {
    mockConstructEvent.mockReturnValue({ type: "invoice.paid", data: { object: {} } });
    const app = createApp();
    const res = await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});
    expect(res.status).toBe(200);
  });
});
