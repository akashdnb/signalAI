import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant, getTenant } from "../../db/tenants.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { recordTokenUsage } from "../../db/tokenUsage.js";
import { tryReserveSend } from "../../db/accountSends.js";

const SESSION_SECRET = "test-session-secret";

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
    // Phase 2B: resolvePriceIdForTier('starter') needs a real price id to
    // resolve against — isBillingConfigured is mocked above, but tier
    // resolution reads config directly, not through that mock.
    process.env.STRIPE_PRICE_ID = "price_test_starter";
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
    const pool = getPool();
    vi.mocked(isBillingConfigured).mockReturnValue(false);
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/billing/checkout`).set(authHeader);
    expect(res.status).toBe(503);
  });

  // requireTenantSession rejects a session for a tenant that doesn't
  // exist (no membership can exist for it) before the route's own
  // not-found check ever runs.
  it("rejects a session for an unknown tenant with 403, before the route's own not-found check", async () => {
    const pool = getPool();
    const { authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app).post(`/tenants/${unknownId}/billing/checkout`).set(authHeader);
    expect(res.status).toBe(403);
  });

  it("POST checkout creates a Stripe Checkout session and returns its URL", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    mockCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" });
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/billing/checkout`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://checkout.stripe.com/session/abc" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "subscription", client_reference_id: tenant.id }),
    );
  });

  it("GET billing status reports none before checkout, and whether billing is configured", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const res = await request(app).get(`/tenants/${tenant.id}/billing`).set(authHeader);
    expect(res.body).toMatchObject({ billingStatus: "none", billingConfigured: true, planTier: "trial" });
  });

  // Phase 2B Plan Tiers.
  it("GET billing status reports the trial tier's quotas and trial end date for a brand-new tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const res = await request(app).get(`/tenants/${tenant.id}/billing`).set(authHeader);

    expect(res.body.planTier).toBe("trial");
    expect(res.body.quotas).toEqual({ dmsPerMonth: 200, connectedAccounts: 1, campaigns: 3, tokenAllowance: 200_000 });
    expect(res.body.trialEndsAt).toBeTruthy();
    expect(res.body.availableTiers).toEqual([
      { tier: "starter", label: "Starter", dmsPerMonth: 1000, connectedAccounts: 1, campaigns: 10, tokenAllowance: 1_000_000 },
    ]); // 'growth' omitted — STRIPE_GROWTH_PRICE_ID isn't set in this test env
  });

  it("POST checkout defaults to the 'starter' tier (the original flat-plan behavior) when no tier is specified", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    mockCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" });
    const app = createApp();

    await request(app).post(`/tenants/${tenant.id}/billing/checkout`).set(authHeader);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: "price_test_starter", quantity: 1 }], metadata: { planTier: "starter" } }),
    );
  });

  it("POST checkout 503s for a tier that isn't configured on this server", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/billing/checkout`).set(authHeader).send({ tier: "growth" });
    expect(res.status).toBe(503);
  });

  // R10-01 regression: the checkout/status routes are exactly what starts
  // and reports on a paid subscription — must not be reachable without a
  // session for the tenant in the URL.
  it("rejects checkout and status requests with no session, or a session for a different tenant", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp();

    const noSession = await request(app).post(`/tenants/${tenant.id}/billing/checkout`);
    expect(noSession.status).toBe(401);

    const wrongSession = await request(app).get(`/tenants/${tenant.id}/billing`).set(otherAuthHeader);
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

  it("checkout.session.completed activates billing for the referenced tenant and sets its plan tier from Checkout metadata", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: tenant.id,
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { planTier: "growth" },
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
      planTier: "growth",
    });
  });

  it("checkout.session.completed falls back to the 'starter' tier when the session has no planTier metadata (an old client, or a pre-Phase-2B session)", async () => {
    const tenant = await createTenant(getPool(), "creator-a");
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: tenant.id, customer: "cus_123", subscription: "sub_123" } },
    });

    const app = createApp();
    await request(app).post("/billing/webhook").set("stripe-signature", "any").send({});

    const updated = await getTenant(getPool(), tenant.id);
    expect(updated!.planTier).toBe("starter");
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

describe("GET /tenants/:tenantId/usage (Phase 2B Usage Visibility Dashboard)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await closePool();
  });

  it("reports zero usage against the trial tier's quotas for a brand-new tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app).get(`/tenants/${tenant.id}/usage`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      planTier: "trial",
      isTrialExpired: false,
      isEntitled: true,
      tokens: { used: 0, allowance: 200_000, overage: 0, estimatedOverageCostUsd: 0, nearingLimit: false },
      dms: { sent: 0, allowance: 200, nearingLimit: false },
    });
  });

  it("reflects real token usage and DM sends, and flags nearingLimit once past 80% of the tier's allowance", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    // Trial allowance is 200,000 tokens — 170,000 used is 85%, over the 80% warning threshold.
    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event!.id, promptTokens: 150_000, completionTokens: 20_000 });
    await tryReserveSend(pool, tenant.id, "acct-1", 750);

    const app = createApp();
    const res = await request(app).get(`/tenants/${tenant.id}/usage`).set(authHeader);

    expect(res.body.tokens.used).toBe(170_000);
    expect(res.body.tokens.nearingLimit).toBe(true);
    expect(res.body.dms.sent).toBe(1);
  });

  it("computes an overage estimate once usage exceeds the tier allowance", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    // 200,000 (allowance) + 50,000 overage.
    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event!.id, promptTokens: 200_000, completionTokens: 50_000 });

    const app = createApp();
    const res = await request(app).get(`/tenants/${tenant.id}/usage`).set(authHeader);

    expect(res.body.tokens.overage).toBe(50_000);
    expect(res.body.tokens.estimatedOverageCostUsd).toBeGreaterThan(0);
  });

  it("rejects a request with no session", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const res = await request(app).get(`/tenants/${tenant.id}/usage`);
    expect(res.status).toBe(401);
  });
});
