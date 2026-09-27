import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenantForUser, setStripeCustomerId, setBillingStatus } from "../../db/tenants.js";
import { findOrCreateUserByEmail } from "../../db/users.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { recordTokenUsage } from "../../db/tokenUsage.js";
import { listUnsyncedRollups } from "../../db/dailyUsageRollup.js";
import { resetDb } from "../../__tests__/helpers/db.js";

const mockMeterEventCreate = vi.fn();

vi.mock("../../lib/stripeClient.js", () => ({
  isBillingConfigured: vi.fn(() => true),
  getStripeClient: vi.fn(() => ({ billing: { meterEvents: { create: mockMeterEventCreate } } })),
}));

import { runDailyUsageRollup, syncUsageRollupsToStripe } from "../usageRollupService.js";

describe("usageRollupService (Phase 2B Daily Usage Rollup -> Stripe Metered Billing)", () => {
  const originalMeterEventName = process.env.STRIPE_METER_EVENT_NAME;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    mockMeterEventCreate.mockReset();
    process.env.STRIPE_METER_EVENT_NAME = "token_usage";
  });

  afterEach(() => {
    process.env.STRIPE_METER_EVENT_NAME = originalMeterEventName;
  });

  afterAll(async () => {
    await closePool();
  });

  it("runDailyUsageRollup aggregates a given date's token_usage into one row per tenant", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event!.id, promptTokens: 100, completionTokens: 20 });

    const today = new Date().toISOString().slice(0, 10);
    const count = await runDailyUsageRollup(pool, today);
    expect(count).toBe(1);

    const rows = await pool.query("select prompt_tokens, completion_tokens from daily_usage_rollup where tenant_id = $1", [tenant.id]);
    expect(rows.rows[0]).toMatchObject({ prompt_tokens: "100", completion_tokens: "20" });
  });

  it("syncUsageRollupsToStripe resolves (marks synced, no Stripe call) a trial tenant's rollup — nothing to report", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id); // stays on 'trial', no Stripe customer

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event!.id, promptTokens: 100, completionTokens: 20 });
    await runDailyUsageRollup(pool, new Date().toISOString().slice(0, 10));

    const result = await syncUsageRollupsToStripe(pool);
    expect(result).toEqual({ reported: 0, resolved: 1 });
    expect(mockMeterEventCreate).not.toHaveBeenCalled();
    expect(await listUnsyncedRollups(pool)).toEqual([]);
  });

  it("syncUsageRollupsToStripe reports a paying tenant's rollup as a Stripe meter event", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    await setStripeCustomerId(pool, tenant.id, "cus_123");
    await setBillingStatus(pool, tenant.id, "active");

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event!.id, promptTokens: 100, completionTokens: 20 });
    await runDailyUsageRollup(pool, new Date().toISOString().slice(0, 10));

    const result = await syncUsageRollupsToStripe(pool);
    expect(result).toEqual({ reported: 1, resolved: 0 });
    expect(mockMeterEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "token_usage",
        payload: { value: "120", stripe_customer_id: "cus_123" },
      }),
    );
    expect(await listUnsyncedRollups(pool)).toEqual([]);
  });

  it("leaves a rollup unsynced (for the next run to retry) when the Stripe call throws", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);
    await setStripeCustomerId(pool, tenant.id, "cus_123");
    await setBillingStatus(pool, tenant.id, "active");

    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-1");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await recordTokenUsage(pool, { tenantId: tenant.id, leadEventId: event!.id, promptTokens: 100, completionTokens: 20 });
    await runDailyUsageRollup(pool, new Date().toISOString().slice(0, 10));

    mockMeterEventCreate.mockRejectedValueOnce(new Error("Stripe outage"));
    const result = await syncUsageRollupsToStripe(pool);
    expect(result).toEqual({ reported: 0, resolved: 0 });
    expect(await listUnsyncedRollups(pool)).toHaveLength(1); // still there for the next run
  });
});
