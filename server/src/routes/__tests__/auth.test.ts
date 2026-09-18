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

/** Extracts the `state` query param from a redirect Location header. */
function extractState(location: string): string {
  return new URL(location).searchParams.get("state")!;
}

function mockSuccessfulExchange() {
  vi.mocked(exchangeCodeForShortLivedToken).mockResolvedValue({ access_token: "short", user_id: "u1" });
  vi.mocked(exchangeForLongLivedToken).mockResolvedValue({ access_token: "long-lived-token", expires_in: 5184000 });
  vi.mocked(fetchInstagramProfile).mockResolvedValue({ id: "acct-1", username: "real_handle" });
}

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
    await getPool().query("truncate table spent_oauth_nonces");
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

  it("start sets an HttpOnly nonce cookie, scoped to /auth/instagram, bound to the redirect's state (R1-02, R4-04)", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/instagram/start").query({ tenantName: "new-creator" });

    const setCookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toContain("ig_oauth_nonce=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie).toContain("Path=/auth/instagram");
  });

  it("start rejects a request with no tenantName", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/instagram/start");
    expect(res.status).toBe(400);
  });

  // R4-01 regression: a tenantId query param used to let anyone who knew
  // (or guessed/leaked) a tenant UUID attach their own Instagram account
  // to someone else's tenant — the R1-02 cookie only proves "same browser
  // started and finished," never "entitled to this tenant." Dropped
  // entirely: every /start call mints a fresh tenant now.
  it("does not accept a tenantId query param — every start mints a fresh tenant regardless (R4-01)", async () => {
    const pool = getPool();
    const victimTenant = await pool.query("insert into tenants (name) values ('victim-tenant') returning id");
    const victimTenantId = victimTenant.rows[0].id;

    mockSuccessfulExchange();
    const app = createApp();
    const agent = request.agent(app);

    // An attacker who learned the victim's tenant id tries to attach
    // their own Instagram account to it via the old query param.
    const start = await agent.get("/auth/instagram/start").query({ tenantName: "attacker", tenantId: victimTenantId });
    const state = extractState(start.headers.location);
    await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });

    const tokenRow = await pool.query(
      "select tenant_id from meta_tokens where instagram_account_id = 'acct-1'",
    );
    // The token attached to a freshly-minted tenant, never to the victim's.
    expect(tokenRow.rows[0].tenant_id).not.toBe(victimTenantId);
  });

  it("callback completes the connection end-to-end (real cookie from /start, real redirect state)", async () => {
    const pool = getPool();
    mockSuccessfulExchange();

    const app = createApp();
    const agent = request.agent(app); // persists cookies across requests, like a real browser

    const start = await agent.get("/auth/instagram/start").query({ tenantName: "creator-a" });
    const state = extractState(start.headers.location);
    const tenantRow = await pool.query("select id from tenants where name = 'creator-a'");
    const tenantId = tenantRow.rows[0].id;

    const res = await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });

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

  // R1-02 regression: a validly-signed state is not enough on its own —
  // this is exactly the account-attachment CSRF the fix closes.
  it("callback rejects a validly-signed state with no matching nonce cookie", async () => {
    const { state } = createOAuthState(APP_SECRET, "some-tenant-id");
    const app = createApp();

    const res = await request(app) // plain request — no cookie jar, simulating a captured/replayed state
      .get("/auth/instagram/callback")
      .query({ code: "auth-code", state });

    expect(res.status).toBe(403);
    expect(exchangeCodeForShortLivedToken).not.toHaveBeenCalled();
  });

  it("callback rejects a replay of the same state+cookie pair after it has already been used once", async () => {
    mockSuccessfulExchange();
    const app = createApp();
    const agent = request.agent(app);
    const start = await agent.get("/auth/instagram/start").query({ tenantName: "creator-a" });
    const state = extractState(start.headers.location);

    const first = await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });
    expect(first.status).toBe(200);

    // Same browser/agent (same cookie jar) replaying the identical URL —
    // the cookie was cleared on first use, so this must fail even though
    // the state string itself is still within its 10-minute validity.
    const replay = await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });
    expect(replay.status).toBe(403);
  });

  // R4-02 regression: "single-use" was previously enforced by asking the
  // browser to drop the cookie — it did nothing server-side. Simulates
  // someone who captured BOTH the state and the raw cookie value (e.g. a
  // shared machine) replaying them from an entirely different client
  // (no shared cookie jar with the original request) after the real user
  // already completed the flow once.
  it("rejects a replay of the same nonce presented by a different client with a manually-set cookie", async () => {
    mockSuccessfulExchange();
    const app = createApp();
    const agent = request.agent(app);
    const start = await agent.get("/auth/instagram/start").query({ tenantName: "creator-a" });
    const state = extractState(start.headers.location);
    const setCookieHeader = start.headers["set-cookie"]![0]!;
    const nonceValue = setCookieHeader.split(";")[0]!.split("=")[1]!;

    const first = await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });
    expect(first.status).toBe(200);

    const replayFromDifferentClient = await request(app)
      .get("/auth/instagram/callback")
      .set("Cookie", `ig_oauth_nonce=${nonceValue}`)
      .query({ code: "auth-code", state });

    expect(replayFromDifferentClient.status).toBe(403);
  });

  // R5-01 regression: /start always mints a fresh tenant, which is correct
  // for a first connection but was silently splitting a creator across two
  // tenants on every reconnect (expired token, failed refresh, clicking
  // "connect" again) — findTenantByInstagramAccountId has no ORDER BY and
  // takes rows[0], so inbound webhooks would then route to an arbitrary
  // one of the two. The fix resolves the tenant from the OAuth-returned
  // account id, reusing the original tenant instead of the freshly-minted
  // one whenever that account is already connected somewhere.
  it("reconnecting the same Instagram account re-attaches to its original tenant, not a new one (R5-01)", async () => {
    const pool = getPool();
    mockSuccessfulExchange();
    const app = createApp();

    const firstAgent = request.agent(app);
    const firstStart = await firstAgent.get("/auth/instagram/start").query({ tenantName: "creator-a" });
    const firstState = extractState(firstStart.headers.location);
    const firstCallback = await firstAgent
      .get("/auth/instagram/callback")
      .query({ code: "auth-code", state: firstState });
    expect(firstCallback.status).toBe(200);

    const originalRow = await pool.query(
      "select tenant_id from meta_tokens where instagram_account_id = 'acct-1'",
    );
    const originalTenantId = originalRow.rows[0].tenant_id;

    // A reconnect: same real Instagram account (mock always returns
    // acct-1), but a brand new browser session/agent — exactly what
    // happens when a creator clicks "connect" again after a token issue.
    mockSuccessfulExchange();
    const secondAgent = request.agent(app);
    const secondStart = await secondAgent.get("/auth/instagram/start").query({ tenantName: "creator-a-again" });
    const secondState = extractState(secondStart.headers.location);
    const secondCallback = await secondAgent
      .get("/auth/instagram/callback")
      .query({ code: "auth-code", state: secondState });
    expect(secondCallback.status).toBe(200);

    const rows = await pool.query("select tenant_id from meta_tokens where instagram_account_id = 'acct-1'");
    expect(rows.rowCount).toBe(1); // never two rows for the same account
    expect(rows.rows[0].tenant_id).toBe(originalTenantId); // reused, not a new tenant
  });

  it("callback rejects a request missing code or state", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/instagram/callback").query({ code: "only-code" });
    expect(res.status).toBe(400);
  });
});
