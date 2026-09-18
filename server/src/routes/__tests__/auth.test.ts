import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createOAuthState } from "../../lib/oauthState.js";

vi.mock("../../lib/instagramOAuth.js", async () => {
  const actual = await vi.importActual<typeof import("../../lib/instagramOAuth.js")>(
    "../../lib/instagramOAuth.js",
  );
  return {
    ...actual,
    exchangeCodeForShortLivedToken: vi.fn(),
    exchangeForLongLivedToken: vi.fn(),
    fetchInstagramProfile: vi.fn(),
  };
});

import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
} from "../../lib/instagramOAuth.js";
import { createApp } from "../../app.js";

const APP_SECRET = "test-app-secret";

describe("auth routes", () => {
  beforeAll(() => {
    process.env.META_APP_SECRET = APP_SECRET;
    process.env.INSTAGRAM_CLIENT_ID = "test-client-id";
    process.env.INSTAGRAM_REDIRECT_URI = "https://example.com/auth/instagram/callback";
    process.env.TOKEN_ENCRYPTION_KEYS = "v1:YE23jw59vZdWaiGV2o9eF4fjuoPcXwsvdwJVi79Q6tQ=";
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    vi.mocked(exchangeCodeForShortLivedToken).mockReset();
    vi.mocked(exchangeForLongLivedToken).mockReset();
    vi.mocked(fetchInstagramProfile).mockReset();
  });

  afterAll(async () => {
    await closePool();
  });

  it("start redirects to Instagram's authorize URL and creates a new tenant for a fresh signup", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/instagram/start").query({ tenantName: "new-creator" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("https://www.instagram.com/oauth/authorize");

    const tenants = await getPool().query("select count(*)::int as count from tenants where name = 'new-creator'");
    expect(tenants.rows[0].count).toBe(1);
  });

  it("start rejects a request with neither tenantName nor tenantId", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/instagram/start");
    expect(res.status).toBe(400);
  });

  it("callback completes the connection: exchanges tokens, stores the encrypted token, keyed to the right tenant", async () => {
    const pool = getPool();
    const tenantRes = await pool.query("insert into tenants (name) values ('creator-a') returning id");
    const tenantId = tenantRes.rows[0].id;
    const state = createOAuthState(APP_SECRET, tenantId);

    vi.mocked(exchangeCodeForShortLivedToken).mockResolvedValue({ access_token: "short", user_id: "u1" });
    vi.mocked(exchangeForLongLivedToken).mockResolvedValue({ access_token: "long-lived-token", expires_in: 5184000 });
    vi.mocked(fetchInstagramProfile).mockResolvedValue({ id: "acct-1", username: "real_handle" });

    const app = createApp();
    const res = await request(app)
      .get("/auth/instagram/callback")
      .query({ code: "auth-code", state });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ connected: true, instagramAccountId: "acct-1", username: "real_handle" });

    const tokenRow = await pool.query(
      "select tenant_id, encrypted_token, status from meta_tokens where instagram_account_id = 'acct-1'",
    );
    expect(tokenRow.rows[0].tenant_id).toBe(tenantId);
    expect(tokenRow.rows[0].encrypted_token.toString("utf8")).not.toContain("long-lived-token");
    expect(tokenRow.rows[0].status).toBe("healthy");
  });

  it("callback rejects a forged or expired state before ever calling Instagram", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/auth/instagram/callback")
      .query({ code: "auth-code", state: "forged.state" });

    expect(res.status).toBe(403);
    expect(exchangeCodeForShortLivedToken).not.toHaveBeenCalled();
  });

  it("callback rejects a request missing code or state", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/instagram/callback").query({ code: "only-code" });
    expect(res.status).toBe(400);
  });
});
