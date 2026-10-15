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
import { resolveEffectiveBilling, billingCycleStart } from "../billingResolver.js";
import { AGENCY_PER_WORKSPACE_TOKEN_ALLOWANCE, getPlanTier } from "../../lib/planTiers.js";

async function freshTenant(name: string) {
  const pool = getPool();
  const user = await findOrCreateUserByEmail(pool, `${name}-${Math.random().toString(36).slice(2)}@example.com`);
  const tenant = await createTenantForUser(pool, name, user.id);
  return { pool, user, tenant };
}

describe("resolveEffectiveBilling", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point at a migrated test database.");
  });
  beforeEach(async () => {
    await resetDb(getPool());
  });
  afterAll(async () => {
    await closePool();
  });

  it("own trial workspace: entitled, trial allowance, no cap", async () => {
    const { pool, tenant } = await freshTenant("trial-ws");
    const effective = await resolveEffectiveBilling(pool, tenant);
    expect(effective).toMatchObject({
      source: "own",
      isTrial: true,
      isEntitled: true,
      tokenAllowance: getPlanTier("trial").tokenAllowance,
      perWorkspaceTokenCap: null,
    });
  });

  it("own paid workspace: entitled via active billing status", async () => {
    const { pool, tenant } = await freshTenant("paid-ws");
    await setPlanTier(pool, tenant.id, "growth");
    await setBillingStatus(pool, tenant.id, "active");
    const effective = await resolveEffectiveBilling(pool, (await getTenant(pool, tenant.id))!);
    expect(effective).toMatchObject({ source: "own", isTrial: false, isEntitled: true });
  });

  it("plan-covered + active: source plan, pooled allowance, entitled regardless of own trial expiry", async () => {
    const { pool, user, tenant } = await freshTenant("covered-ws");
    const account = await createBillingAccount(pool, user.id, 5);
    await addWorkspaceToBillingAccount(pool, account.id, tenant.id);
    await setBillingAccountStatus(pool, account.id, "active", "sub_1");
    await setWorkspaceTokenCap(pool, account.id, tenant.id, 25_000);

    const effective = await resolveEffectiveBilling(pool, (await getTenant(pool, tenant.id))!);
    expect(effective).toMatchObject({
      source: "plan",
      isEntitled: true,
      isTrial: false,
      billingStatus: "active",
      perWorkspaceTokenCap: 25_000,
      tokenAllowance: 1 * AGENCY_PER_WORKSPACE_TOKEN_ALLOWANCE,
      billingAccountId: account.id,
    });
  });

  it("plan covered but NOT active: falls back to own billing", async () => {
    const { pool, user, tenant } = await freshTenant("lapsed-ws");
    const account = await createBillingAccount(pool, user.id, 5);
    await addWorkspaceToBillingAccount(pool, account.id, tenant.id);
    await setBillingAccountStatus(pool, account.id, "past_due", "sub_1");

    const effective = await resolveEffectiveBilling(pool, (await getTenant(pool, tenant.id))!);
    expect(effective.source).toBe("own"); // past_due plan does not cover
  });

  it("billingCycleStart: trial uses trial start; plan/paid use month start", async () => {
    const { pool, user, tenant } = await freshTenant("cycle-ws");
    const trialEffective = await resolveEffectiveBilling(pool, tenant);
    expect(billingCycleStart(trialEffective).getTime()).toBe(tenant.trialStartedAt!.getTime());

    const account = await createBillingAccount(pool, user.id, 5);
    await addWorkspaceToBillingAccount(pool, account.id, tenant.id);
    await setBillingAccountStatus(pool, account.id, "active", "sub_1");
    const now = new Date();
    const planEffective = await resolveEffectiveBilling(pool, (await getTenant(pool, tenant.id))!, now);
    expect(billingCycleStart(planEffective, now).getTime()).toBe(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
  });
});
