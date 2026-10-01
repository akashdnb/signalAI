import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { getPool, closePool } from "../../../db/pool.js";
import { createTenant } from "../../../db/tenants.js";
import {
  InstagramAccountRepository,
} from "../instagramAccounts.js";

const pool = getPool();

describe("InstagramAccountRepository", () => {
  const tenantIds: string[] = [];

  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY =
      Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(async () => {
    for (const tenantId of tenantIds.splice(0)) {
      await pool.query(
        `
          delete from tenants
          where id = $1
        `,
        [tenantId],
      );
    }
  });

  afterAll(async () => {
    await closePool();
  });

  async function createTestTenant(): Promise<string> {
    const tenant = await createTenant(
      pool,
      `instagram-account-test-${randomUUID()}`,
    );

    tenantIds.push(tenant.id);

    return tenant.id;
  }

  it("stores the access token encrypted", async () => {
    const tenantId = await createTestTenant();

    const repository = new InstagramAccountRepository(pool);

    await repository.save({
      id: randomUUID(),
      tenantId,
      instagramUserId: "ig-user-1",
      accessToken: "super-secret-token",
    });

    const result = await pool.query(
      `
        select access_token_encrypted
        from instagram_accounts
        where tenant_id = $1
      `,
      [tenantId],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].access_token_encrypted).not.toBe(
      "super-secret-token",
    );
  });

  it("retrieves and decrypts the token for the correct tenant", async () => {
    const tenantId = await createTestTenant();

    const repository = new InstagramAccountRepository(pool);

    await repository.save({
      id: randomUUID(),
      tenantId,
      instagramUserId: "ig-user-1",
      accessToken: "secret-token",
    });

    const result = await repository.getForTenant(
      tenantId,
      "ig-user-1",
    );

    expect(result).not.toBeNull();
    expect(result!.account.tenantId).toBe(tenantId);
    expect(result!.account.instagramUserId).toBe("ig-user-1");
    expect(result!.accessToken).toBe("secret-token");
  });

  it("does not allow another tenant to access the account", async () => {
    const ownerTenantId = await createTestTenant();
    const otherTenantId = await createTestTenant();

    const repository = new InstagramAccountRepository(pool);

    await repository.save({
      id: randomUUID(),
      tenantId: ownerTenantId,
      instagramUserId: "ig-user-1",
      accessToken: "secret-token",
    });

    const result = await repository.getForTenant(
      otherTenantId,
      "ig-user-1",
    );

    expect(result).toBeNull();
  });
});
