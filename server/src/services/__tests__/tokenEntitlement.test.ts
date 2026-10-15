import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { findOrCreateUserByEmail } from "../../db/users.js";
import { createTenantForUser, getTenant, setBillingStatus, setPlanTier } from "../../db/tenants.js";
import {
  createBillingAccount,
  addWorkspaceToBillingAccount,
  setBillingAccountStatus,
  setWorkspaceTokenCap,
} from "../../db/billingAccounts.js";
import { recordTokenUsage } from "../../db/tokenUsage.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { insertEventIdempotent } from "../../db/events.js";
import { wrapSpendGuardWithTokenEntitlement } from "../tokenEntitlement.js";
import { ALLOW_ALL_SPEND_GUARD } from "../aiSpendGuard.js";
import { getPlanTier } from "../../lib/planTiers.js";

let eventSequence = 0;

/** Records `tokens` of usage for a workspace via a real lead_event (token_usage FKs to it). */
async function burnTokens(tenantId: string, tokens: number) {
  const pool = getPool();
  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, `ig-${Math.random().toString(36).slice(2)}`);
  eventSequence += 1;
  const event = await insertEventIdempotent(pool, {
    tenantId,
    leadId: lead.id,
    metaEventId: `evt-${eventSequence}-${Math.random().toString(36).slice(2)}`,
    eventType: "comment",
    occurredAt: new Date(),
    sequence: eventSequence,
  });
  await recordTokenUsage(pool, { tenantId, leadEventId: event!.id, promptTokens: tokens, completionTokens: 0 });
}

describe("wrapSpendGuardWithTokenEntitlement", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point at a migrated test database.");
  });
  beforeEach(async () => {
    await resetDb(getPool());
  });
  afterAll(async () => {
    await closePool();
  });

  async function freshTenant(name: string) {
    const pool = getPool();
    const user = await findOrCreateUserByEmail(pool, `${name}-${Math.random().toString(36).slice(2)}@example.com`);
    const tenant = await createTenantForUser(pool, name, user.id);
    return { user, tenant };
  }

  it("own paid workspace: no token ceiling (returns the base guard as-is)", async () => {
    const pool = getPool();
    const { tenant } = await freshTenant("paid");
    await setPlanTier(pool, tenant.id, "growth");
    await setBillingStatus(pool, tenant.id, "active");

    const guard = await wrapSpendGuardWithTokenEntitlement(pool, (await getTenant(pool, tenant.id))!, ALLOW_ALL_SPEND_GUARD);
    expect(guard).toBe(ALLOW_ALL_SPEND_GUARD);
  });

  it("trial workspace: blocks once cumulative trial allowance is spent", async () => {
    const pool = getPool();
    const { tenant } = await freshTenant("trial");
    const guard = await wrapSpendGuardWithTokenEntitlement(pool, tenant, ALLOW_ALL_SPEND_GUARD);

    expect(await guard.tryConsume()).toBe(true); // nothing spent yet
    await burnTokens(tenant.id, getPlanTier("trial").tokenAllowance);
    expect(await guard.tryConsume()).toBe(false); // over the allowance now
  });

  it("plan-covered with a per-workspace cap: blocks at the cap, other workspaces unaffected", async () => {
    const pool = getPool();
    const { user, tenant } = await freshTenant("covered");
    const other = await createTenantForUser(pool, "other", user.id);
    const account = await createBillingAccount(pool, user.id, 5);
    await addWorkspaceToBillingAccount(pool, account.id, tenant.id);
    await addWorkspaceToBillingAccount(pool, account.id, other.id);
    await setBillingAccountStatus(pool, account.id, "active", "sub_1");
    await setWorkspaceTokenCap(pool, account.id, tenant.id, 10_000);

    const guard = await wrapSpendGuardWithTokenEntitlement(pool, (await getTenant(pool, tenant.id))!, ALLOW_ALL_SPEND_GUARD);
    expect(await guard.tryConsume()).toBe(true);
    await burnTokens(tenant.id, 10_000);
    expect(await guard.tryConsume()).toBe(false); // capped workspace is blocked

    // The other covered workspace (uncapped) is untouched by the first's spend.
    const otherGuard = await wrapSpendGuardWithTokenEntitlement(pool, (await getTenant(pool, other.id))!, ALLOW_ALL_SPEND_GUARD);
    expect(otherGuard).toBe(ALLOW_ALL_SPEND_GUARD); // uncapped → bare base guard
  });

  it("plan-covered without a cap: draws freely from the pool (base guard as-is)", async () => {
    const pool = getPool();
    const { user, tenant } = await freshTenant("uncapped");
    const account = await createBillingAccount(pool, user.id, 5);
    await addWorkspaceToBillingAccount(pool, account.id, tenant.id);
    await setBillingAccountStatus(pool, account.id, "active", "sub_1");

    const guard = await wrapSpendGuardWithTokenEntitlement(pool, (await getTenant(pool, tenant.id))!, ALLOW_ALL_SPEND_GUARD);
    expect(guard).toBe(ALLOW_ALL_SPEND_GUARD);
  });
});
