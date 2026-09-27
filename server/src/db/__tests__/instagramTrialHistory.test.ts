import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { registerInstagramTrialUse } from "../instagramTrialHistory.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("instagram trial history (Phase 2B Trial-Abuse Guardrail)", () => {
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

  it("reports isFirstUse true the first time an Instagram account is ever registered", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    const result = await registerInstagramTrialUse(pool, "ig-acct-1", tenant.id);
    expect(result).toEqual({ isFirstUse: true, firstTenantId: tenant.id });
  });

  it("reports isFirstUse false, with the ORIGINAL tenant id, on a second registration by a different tenant", async () => {
    const pool = getPool();
    const ownerA = await findOrCreateUserByEmail(pool, "a@example.com");
    const tenantA = await createTenantForUser(pool, "creator-a", ownerA.id);
    const ownerB = await findOrCreateUserByEmail(pool, "b@example.com");
    const tenantB = await createTenantForUser(pool, "creator-b", ownerB.id);

    await registerInstagramTrialUse(pool, "ig-acct-1", tenantA.id);
    const second = await registerInstagramTrialUse(pool, "ig-acct-1", tenantB.id);

    expect(second).toEqual({ isFirstUse: false, firstTenantId: tenantA.id });
  });

  it("reports isFirstUse false but the SAME tenant id when the same tenant re-registers its own account", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    await registerInstagramTrialUse(pool, "ig-acct-1", tenant.id);
    const again = await registerInstagramTrialUse(pool, "ig-acct-1", tenant.id);

    expect(again).toEqual({ isFirstUse: false, firstTenantId: tenant.id });
  });
});
