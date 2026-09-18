import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken, getDecryptedToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";

vi.mock("../../lib/instagramOAuth.js", () => ({
  refreshLongLivedToken: vi.fn(),
}));

import { refreshLongLivedToken } from "../../lib/instagramOAuth.js";
import { runTokenRefreshSweep } from "../tokenRefreshJob.js";

const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);

async function backdateUpdatedAt(instagramAccountId: string, hoursAgo: number) {
  await getPool().query(
    `update meta_tokens set updated_at = now() - ($1 || ' hours')::interval where instagram_account_id = $2`,
    [hoursAgo, instagramAccountId],
  );
}

describe("runTokenRefreshSweep", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    vi.mocked(refreshLongLivedToken).mockReset();
  });

  afterEach(() => {
    vi.mocked(refreshLongLivedToken).mockReset();
  });

  afterAll(async () => {
    await closePool();
  });

  it("refreshes a token that is both expiring soon and old enough to refresh", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "old-token",
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days — inside the 5-day window
    });
    await backdateUpdatedAt("acct-1", 48); // connected 2 days ago — refreshable

    vi.mocked(refreshLongLivedToken).mockResolvedValue({
      access_token: "new-token",
      expires_in: 60 * 24 * 60 * 60,
    });

    const results = await runTokenRefreshSweep(pool, keyring);

    expect(results).toEqual([{ tenantId: tenant.id, instagramAccountId: "acct-1", ok: true }]);
    expect(await getDecryptedToken(pool, keyring, tenant.id, "acct-1")).toBe("new-token");

    const row = await pool.query("select status from meta_tokens where instagram_account_id = 'acct-1'");
    expect(row.rows[0].status).toBe("healthy");
  });

  it("excludes a token connected less than 24h ago even if it's expiring soon", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-fresh",
      accessToken: "token",
      expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // expiring very soon
    });
    // upsertToken just set updated_at = now(), so it's fresh — no backdate.

    const results = await runTokenRefreshSweep(pool, keyring);

    expect(results).toEqual([]);
    expect(refreshLongLivedToken).not.toHaveBeenCalled();
  });

  it("excludes a token that isn't expiring soon", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-healthy",
      accessToken: "token",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days out
    });
    await backdateUpdatedAt("acct-healthy", 48);

    const results = await runTokenRefreshSweep(pool, keyring);
    expect(results).toEqual([]);
  });

  it("marks a token as errored, with the reason recorded, when the refresh call fails", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-broken",
      accessToken: "old-token",
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });
    await backdateUpdatedAt("acct-broken", 48);

    vi.mocked(refreshLongLivedToken).mockRejectedValue(new Error("token expired upstream"));

    const results = await runTokenRefreshSweep(pool, keyring);

    expect(results).toEqual([
      { tenantId: tenant.id, instagramAccountId: "acct-broken", ok: false, error: "token expired upstream" },
    ]);

    const row = await pool.query(
      "select status, last_error from meta_tokens where instagram_account_id = 'acct-broken'",
    );
    expect(row.rows[0].status).toBe("error");
    expect(row.rows[0].last_error).toBe("token expired upstream");
  });
});
