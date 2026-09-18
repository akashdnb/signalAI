import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { getDecryptedToken, upsertToken } from "../tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("token vault repository", () => {
  const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);

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

  it("round-trips an access token through encryption and back out", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "IGQ...real-token",
    });

    const decrypted = await getDecryptedToken(pool, keyring, tenant.id, "acct-1");
    expect(decrypted).toBe("IGQ...real-token");
  });

  it("stores the token encrypted at rest, not as plaintext", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "IGQ...real-token",
    });

    const raw = await pool.query<{ encrypted_token: Buffer }>(
      "select encrypted_token from meta_tokens where tenant_id = $1",
      [tenant.id],
    );
    expect(raw.rows[0]!.encrypted_token.toString("utf8")).not.toContain("real-token");
  });

  it("reconnecting an account overwrites the previous token, not adds a second row", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "first-token",
    });
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "second-token",
    });

    const rows = await pool.query(
      "select count(*)::int as count from meta_tokens where tenant_id = $1",
      [tenant.id],
    );
    expect(rows.rows[0].count).toBe(1);
    expect(await getDecryptedToken(pool, keyring, tenant.id, "acct-1")).toBe("second-token");
  });

  it("returns null for an account with no stored token", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    expect(await getDecryptedToken(pool, keyring, tenant.id, "never-connected")).toBeNull();
  });
});
