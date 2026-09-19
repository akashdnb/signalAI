import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant, getTenant } from "../../db/tenants.js";
import { createSessionToken } from "../../lib/session.js";
import { resetDb } from "../../__tests__/helpers/db.js";

const SESSION_SECRET = "test-session-secret";

function authHeader(tenantId: string) {
  return { Authorization: `Bearer ${createSessionToken(SESSION_SECRET, tenantId)}` };
}

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
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table stripe_webhook_events");
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

    const res = await request(app).post(`/tenants/${tenant.id}/billing/checkout`).set(authHeader(tenant.id));
    expect(res.status).toBe(503);
  });

  it("POST checkout 404s for an unknown tenant", async () => {
    const app = createApp();
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app).post(`/tenants/${unknownId}/billing/checkout`).set(authHeader(unknownId));
    expect(res.status).toBe(404);
  });

  it("POST checkout creates a Stripe Checkout session and returns its URL", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    mockCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" });
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/billing/checkout`).set(authHeader(tenant.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://checkout.stripe.com/session/abc" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "subscription", client_reference_id: tenant.id }),
    );
  });

  it("GET billing status reports none before checkout, and whether billing is configured", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const app = createApp();
    const res = await request(app).get(`/tenants/${tenant.id}/billing`).set(authHeader(tenant.id));
    expect(res.body).toEqual({ billingStatus: "none", billingConfigured: true });
  });

  // R10-01 regression: the checkout/status routes are exactly what starts
  // and reports on a paid subscription — must not be reachable without a
  // session for the tenant in the URL.
  it("rejects checkout and status requests with no session, or a session for a different tenant", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    const otherTenant = await createTenant(getPool(), "creator-b");
    const app = createApp();

    const noSession = await request(app).post(`/tenants/${tenant.id}/billing/checkout`);
    expect(noSession.status).toBe(401);

    const wrongSession = await request(app)
      .get(`/tenants/${tenant.id}/billing`)
      .set(authHeader(otherTenant.id));
    expect(wrongSession.status).toBe(403);
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
      id: "evt_1",
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
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: tenant.id, customer: "cus_456", subscription: "sub_456" } },
    });
    const app = createApp();
    await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});

    mockConstructEvent.mockReturnValueOnce({
      id: "evt_3",
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_456", id: "sub_456" } },
    });
    const res = await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});
    expect(res.status).toBe(200);

    const updated = await getTenant(pool, tenant.id);
    expect(updated!.billingStatus).toBe("canceled");
  });

  // R10-02 regression: Stripe doesn't guarantee event ordering. A tenant
  // cancels (sub_A deleted), immediately resubscribes (sub_B active), and
  // the delayed/retried deletion event for the OLD subscription (sub_A)
  // then arrives — it must not cancel the tenant's CURRENT subscription.
  it("ignores a stale subscription.deleted event for a subscription that is no longer current", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const app = createApp();

    mockConstructEvent.mockReturnValueOnce({
      id: "evt_sub_a",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: tenant.id, customer: "cus_789", subscription: "sub_A" } },
    });
    await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});

    // Resubscribed — same Stripe customer, new subscription.
    mockConstructEvent.mockReturnValueOnce({
      id: "evt_sub_b",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: tenant.id, customer: "cus_789", subscription: "sub_B" } },
    });
    await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});

    // The stale deletion event for the OLD subscription arrives late.
    mockConstructEvent.mockReturnValueOnce({
      id: "evt_stale_delete",
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_789", id: "sub_A" } },
    });
    const res = await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});
    expect(res.status).toBe(200);

    const updated = await getTenant(pool, tenant.id);
    expect(updated).toMatchObject({ billingStatus: "active", stripeSubscriptionId: "sub_B" });
  });

  // R10-03 regression: the same event id delivered twice (Stripe's own
  // retry behavior) must be recorded once, not processed as two separate
  // events.
  it("records a Stripe event id only once even when the same event is delivered twice", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const app = createApp();
    const event = {
      id: "evt_dup",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: tenant.id, customer: "cus_dup", subscription: "sub_dup" } },
    };

    mockConstructEvent.mockReturnValueOnce(event);
    const first = await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});
    expect(first.status).toBe(200);

    mockConstructEvent.mockReturnValueOnce(event);
    const second = await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});
    expect(second.status).toBe(200);

    const rows = await pool.query("select count(*)::int as count from stripe_webhook_events where event_id = $1", [
      "evt_dup",
    ]);
    expect(rows.rows[0].count).toBe(1);
  });

  it("ignores event types it doesn't handle, without erroring", async () => {
    mockConstructEvent.mockReturnValue({ id: "evt_ignored", type: "invoice.paid", data: { object: {} } });
    const app = createApp();
    const res = await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});
    expect(res.status).toBe(200);
  });
});
