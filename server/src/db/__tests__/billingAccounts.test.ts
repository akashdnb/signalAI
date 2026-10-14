import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { findOrCreateUserByEmail } from "../users.js";
import { createTenantForUser } from "../tenants.js";
import {
  createBillingAccount,
  getBillingAccountByOwner,
  getWorkspaceCoverage,
  addWorkspaceToBillingAccount,
  removeWorkspaceFromBillingAccount,
  setWorkspaceTokenCap,
  listCoveredWorkspaces,
  countCoveredWorkspaces,
  setBillingAccountStatus,
  setBillingAccountStripeCustomer,
  getBillingAccountByStripeCustomerId,
} from "../billingAccounts.js";

describe("billingAccounts", () => {
  beforeAll(() => {
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

  it("creates a plan and enforces one-per-owner", async () => {
    const pool = getPool();
    const user = await findOrCreateUserByEmail(pool, "agency@example.com");
    const account = await createBillingAccount(pool, user.id, 5);

    expect(account.workspaceLimit).toBe(5);
    expect(account.billingStatus).toBe("none");
    expect(await getBillingAccountByOwner(pool, user.id)).toMatchObject({ id: account.id });

    await expect(createBillingAccount(pool, user.id, 3)).rejects.toThrow();
  });

  it("adds workspaces up to the limit, then reports limit_reached", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "agency@example.com");
    const account = await createBillingAccount(pool, owner.id, 2);
    const a = await createTenantForUser(pool, "A", owner.id);
    const b = await createTenantForUser(pool, "B", owner.id);
    const c = await createTenantForUser(pool, "C", owner.id);

    expect(await addWorkspaceToBillingAccount(pool, account.id, a.id)).toBe("added");
    expect(await addWorkspaceToBillingAccount(pool, account.id, b.id)).toBe("added");
    expect(await addWorkspaceToBillingAccount(pool, account.id, c.id)).toBe("limit_reached");
    expect(await countCoveredWorkspaces(pool, account.id)).toBe(2);
  });

  it("refuses to cover a workspace already covered by any plan", async () => {
    const pool = getPool();
    const owner1 = await findOrCreateUserByEmail(pool, "a1@example.com");
    const owner2 = await findOrCreateUserByEmail(pool, "a2@example.com");
    const account1 = await createBillingAccount(pool, owner1.id, 5);
    const account2 = await createBillingAccount(pool, owner2.id, 5);
    const ws = await createTenantForUser(pool, "Shared", owner1.id);

    expect(await addWorkspaceToBillingAccount(pool, account1.id, ws.id)).toBe("added");
    // Same plan again, and a different plan, both report already_covered.
    expect(await addWorkspaceToBillingAccount(pool, account1.id, ws.id)).toBe("already_covered");
    expect(await addWorkspaceToBillingAccount(pool, account2.id, ws.id)).toBe("already_covered");
  });

  it("resolves coverage with the plan's live status and the workspace cap", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "agency@example.com");
    const account = await createBillingAccount(pool, owner.id, 5);
    const ws = await createTenantForUser(pool, "WS", owner.id);
    await addWorkspaceToBillingAccount(pool, account.id, ws.id);

    let coverage = await getWorkspaceCoverage(pool, ws.id);
    expect(coverage).toMatchObject({ billingAccountId: account.id, billingStatus: "none", perWorkspaceTokenCap: null });

    await setBillingAccountStatus(pool, account.id, "active", "sub_123");
    await setWorkspaceTokenCap(pool, account.id, ws.id, 50_000);
    coverage = await getWorkspaceCoverage(pool, ws.id);
    expect(coverage).toMatchObject({ billingStatus: "active", perWorkspaceTokenCap: 50_000 });

    // Clearing the cap returns null again.
    await setWorkspaceTokenCap(pool, account.id, ws.id, null);
    expect((await getWorkspaceCoverage(pool, ws.id))!.perWorkspaceTokenCap).toBeNull();
  });

  it("removes a workspace so it is no longer covered", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "agency@example.com");
    const account = await createBillingAccount(pool, owner.id, 5);
    const ws = await createTenantForUser(pool, "WS", owner.id);
    await addWorkspaceToBillingAccount(pool, account.id, ws.id);

    expect(await removeWorkspaceFromBillingAccount(pool, account.id, ws.id)).toBe(true);
    expect(await getWorkspaceCoverage(pool, ws.id)).toBeNull();
    expect(await listCoveredWorkspaces(pool, account.id)).toEqual([]);
    // Removing again is a no-op.
    expect(await removeWorkspaceFromBillingAccount(pool, account.id, ws.id)).toBe(false);
  });

  it("looks a plan up by its Stripe customer id", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "agency@example.com");
    const account = await createBillingAccount(pool, owner.id, 5);
    await setBillingAccountStripeCustomer(pool, account.id, "cus_agency");

    const found = await getBillingAccountByStripeCustomerId(pool, "cus_agency");
    expect(found).toMatchObject({ id: account.id, stripeCustomerId: "cus_agency" });
  });
});
