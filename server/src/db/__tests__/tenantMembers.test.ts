import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { findOrCreateUserByEmail } from "../users.js";
import { createTenantForUser } from "../tenants.js";
import { addTenantMember, isTenantMember, listTenantsForUser } from "../tenantMembers.js";

describe("tenantMembers", () => {
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

  it("createTenantForUser creates the tenant, sets owner_user_id, and adds the owner membership atomically", async () => {
    const pool = getPool();
    const user = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "Owner's workspace", user.id);

    expect(tenant.ownerUserId).toBe(user.id);
    expect(await isTenantMember(pool, tenant.id, user.id)).toBe(true);

    const memberships = await listTenantsForUser(pool, user.id);
    expect(memberships).toEqual([{ tenantId: tenant.id, role: "owner" }]);
  });

  it("a user is not a member of a tenant they were never added to", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const stranger = await findOrCreateUserByEmail(pool, "stranger@example.com");
    const tenant = await createTenantForUser(pool, "Owner's workspace", owner.id);

    expect(await isTenantMember(pool, tenant.id, stranger.id)).toBe(false);
  });

  it("addTenantMember is idempotent — adding the same membership twice doesn't duplicate it", async () => {
    const pool = getPool();
    const user = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "Owner's workspace", user.id);

    await addTenantMember(pool, tenant.id, user.id, "owner");
    await addTenantMember(pool, tenant.id, user.id, "owner");

    const rows = await pool.query("select count(*)::int as count from tenant_members where tenant_id = $1", [
      tenant.id,
    ]);
    expect(rows.rows[0].count).toBe(1);
  });

  it("listTenantsForUser returns nothing for a user with no memberships", async () => {
    const pool = getPool();
    const user = await findOrCreateUserByEmail(pool, "lonely@example.com");
    expect(await listTenantsForUser(pool, user.id)).toEqual([]);
  });
});
