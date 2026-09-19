import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import { createOAuthState } from "../../lib/oauthState.js";

const SESSION_SECRET_FOR_TESTS = "test-session-secret";

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
const APP_BASE_URL = "https://app.example.com";
const API_BASE_URL = "https://api.example.com";

/** Extracts the `state` query param from a redirect Location header. */
function extractState(location: string): string {
  return new URL(location).searchParams.get("state")!;
}

function mockSuccessfulExchange(igAccountId = "acct-1") {
  vi.mocked(exchangeCodeForShortLivedToken).mockResolvedValue({ access_token: "short", user_id: "u1" });
  vi.mocked(exchangeForLongLivedToken).mockResolvedValue({ access_token: "long-lived-token", expires_in: 5184000 });
  vi.mocked(fetchInstagramProfile).mockResolvedValue({ id: igAccountId, username: "real_handle" });
}

/**
 * Mints a connect link (the authenticated JSON step BUI does before the
 * top-level navigation — see routes/auth.ts's docstring on `/connect-link`)
 * and returns just the path+query, ready to `.get()` against the app
 * directly with the given agent (so cookies from the resulting redirect
 * are captured the same way a real browser would).
 */
async function mintStartUrl(app: import("express").Express, tenantId: string, authHeader: { Authorization: string }) {
  const res = await request(app).post(`/tenants/${tenantId}/instagram/connect-link`).set(authHeader);
  expect(res.status).toBe(200);
  const url = new URL(res.body.url);
  return url.pathname + url.search;
}

describe("auth routes (Instagram connect — Identity Refactor U4/U5)", () => {
  beforeAll(() => {
    process.env.META_APP_SECRET = APP_SECRET;
    process.env.INSTAGRAM_CLIENT_ID = "test-client-id";
    process.env.INSTAGRAM_REDIRECT_URI = "https://example.com/auth/instagram/callback";
    process.env.TOKEN_ENCRYPTION_KEYS = "v1:YE23jw59vZdWaiGV2o9eF4fjuoPcXwsvdwJVi79Q6tQ=";
    process.env.APP_BASE_URL = APP_BASE_URL;
    process.env.API_BASE_URL = API_BASE_URL;
    process.env.SESSION_SECRET = SESSION_SECRET_FOR_TESTS;
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

  it("connect-link requires a session — 401 with none", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/instagram/connect-link`);
    expect(res.status).toBe(401);
  });

  it("connect-link requires the caller to be a member of tenantId — 403 for a real tenant the session isn't a member of", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const { authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-b");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/instagram/connect-link`).set(otherAuthHeader);
    expect(res.status).toBe(403);
  });

  it("start rejects a request with no tenantId or connectToken", async () => {
    const app = createApp();
    const noTenant = await request(app).get("/auth/instagram/start").query({ connectToken: "x" });
    expect(noTenant.status).toBe(400);

    const noToken = await request(app).get("/auth/instagram/start").query({ tenantId: "some-id" });
    expect(noToken.status).toBe(400);
  });

  it("start rejects a connectToken minted for a DIFFERENT tenantId than the one in the query", async () => {
    const pool = getPool();
    const { tenant: tenantA } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const { tenant: tenantB, authHeader: authHeaderB } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-b");
    const app = createApp();

    const startUrl = await mintStartUrl(app, tenantB.id, authHeaderB);
    const tamperedUrl = startUrl.replace(`tenantId=${tenantB.id}`, `tenantId=${tenantA.id}`);

    const res = await request(app).get(tamperedUrl);
    expect(res.status).toBe(401);
  });

  it("start redirects to Instagram's authorize URL and creates no new tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const app = createApp();

    const before = await pool.query("select count(*)::int as count from tenants");
    const startUrl = await mintStartUrl(app, tenant.id, authHeader);
    const res = await request(app).get(startUrl);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("https://www.instagram.com/oauth/authorize");

    const after = await pool.query("select count(*)::int as count from tenants");
    expect(after.rows[0].count).toBe(before.rows[0].count); // no new tenant minted
  });

  // R15-01 fix: verifyOAuthState alone only checks signature + expiry, so a
  // captured connect URL used to stay valid for its whole 10-minute window —
  // a second visit minted a brand new OAuth state/nonce off the same
  // connect token just as readily as the first.
  it("start rejects a replayed connectToken — single use (R15-01)", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const app = createApp();

    const startUrl = await mintStartUrl(app, tenant.id, authHeader);

    const first = await request(app).get(startUrl);
    expect(first.status).toBe(302);

    const second = await request(app).get(startUrl);
    expect(second.status).toBe(401);
  });

  it("start sets an HttpOnly nonce cookie, scoped to /auth/instagram, bound to the redirect's state (R1-02, R4-04)", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const app = createApp();
    const startUrl = await mintStartUrl(app, tenant.id, authHeader);
    const res = await request(app).get(startUrl);

    const setCookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toContain("ig_oauth_nonce=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie).toContain("Path=/auth/instagram");
  });

  // BUI: a real browser lands on the callback URL via a top-level
  // navigation (Instagram's own redirect), not a fetch — every outcome
  // redirects back into the app rather than returning raw JSON. No
  // session is issued here anymore (U5) — the caller was already logged
  // in before starting the flow, and stays logged in throughout.
  it("callback completes the connection end-to-end and redirects to the dashboard, with no new session issued", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    mockSuccessfulExchange();

    const app = createApp();
    const agent = request.agent(app); // persists cookies across requests, like a real browser

    const startUrl = await mintStartUrl(app, tenant.id, authHeader);
    const start = await agent.get(startUrl);
    const state = extractState(start.headers.location);

    const res = await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_BASE_URL}/dashboard/${tenant.id}?connected=1`);
    expect(res.headers.location).not.toContain("#token="); // no session minted here

    const tokenRow = await pool.query(
      "select tenant_id, encrypted_token, status from meta_tokens where instagram_account_id = 'acct-1'",
    );
    expect(tokenRow.rows[0].tenant_id).toBe(tenant.id);
    expect(tokenRow.rows[0].encrypted_token.toString("utf8")).not.toContain("long-lived-token");
    expect(tokenRow.rows[0].status).toBe("healthy");
  });

  it("callback rejects a forged or expired state before ever calling Instagram, redirecting to the retry screen", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/auth/instagram/callback")
      .query({ code: "auth-code", state: "forged.state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_BASE_URL}/connect?error=invalid_state`);
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

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_BASE_URL}/connect?error=session_mismatch`);
    expect(exchangeCodeForShortLivedToken).not.toHaveBeenCalled();
  });

  it("callback rejects a replay of the same state+cookie pair after it has already been used once", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    mockSuccessfulExchange();
    const app = createApp();
    const agent = request.agent(app);
    const startUrl = await mintStartUrl(app, tenant.id, authHeader);
    const start = await agent.get(startUrl);
    const state = extractState(start.headers.location);

    const first = await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });
    expect(first.status).toBe(302);
    expect(first.headers.location).toContain("/dashboard/");

    // Same browser/agent (same cookie jar) replaying the identical URL —
    // the cookie was cleared on first use, so this must fail even though
    // the state string itself is still within its 10-minute validity.
    const replay = await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });
    expect(replay.status).toBe(302);
    expect(replay.headers.location).toBe(`${APP_BASE_URL}/connect?error=session_mismatch`);
  });

  // R4-02 regression: "single-use" was previously enforced by asking the
  // browser to drop the cookie — it did nothing server-side. Simulates
  // someone who captured BOTH the state and the raw cookie value (e.g. a
  // shared machine) replaying them from an entirely different client
  // (no shared cookie jar with the original request) after the real user
  // already completed the flow once.
  it("rejects a replay of the same nonce presented by a different client with a manually-set cookie", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    mockSuccessfulExchange();
    const app = createApp();
    const agent = request.agent(app);
    const startUrl = await mintStartUrl(app, tenant.id, authHeader);
    const start = await agent.get(startUrl);
    const state = extractState(start.headers.location);
    const setCookieHeader = start.headers["set-cookie"]![0]!;
    const nonceValue = setCookieHeader.split(";")[0]!.split("=")[1]!;

    const first = await agent.get("/auth/instagram/callback").query({ code: "auth-code", state });
    expect(first.status).toBe(302);
    expect(first.headers.location).toContain("/dashboard/");

    const replayFromDifferentClient = await request(app)
      .get("/auth/instagram/callback")
      .set("Cookie", `ig_oauth_nonce=${nonceValue}`)
      .query({ code: "auth-code", state });

    expect(replayFromDifferentClient.status).toBe(302);
    expect(replayFromDifferentClient.headers.location).toBe(`${APP_BASE_URL}/connect?error=already_used`);
  });

  // Identity Refactor U5: reconnecting the SAME tenant to the SAME
  // Instagram account (token refresh, retry after a failure) must update
  // the one meta_tokens row, not create a second.
  it("reconnecting the same tenant to the same Instagram account updates the one token row", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const app = createApp();

    mockSuccessfulExchange();
    const firstAgent = request.agent(app);
    const firstStartUrl = await mintStartUrl(app, tenant.id, authHeader);
    const firstStart = await firstAgent.get(firstStartUrl);
    const firstState = extractState(firstStart.headers.location);
    const first = await firstAgent.get("/auth/instagram/callback").query({ code: "auth-code", state: firstState });
    expect(first.status).toBe(302);

    mockSuccessfulExchange(); // same acct-1
    const secondAgent = request.agent(app);
    const secondStartUrl = await mintStartUrl(app, tenant.id, authHeader);
    const secondStart = await secondAgent.get(secondStartUrl);
    const secondState = extractState(secondStart.headers.location);
    const second = await secondAgent.get("/auth/instagram/callback").query({ code: "auth-code", state: secondState });
    expect(second.status).toBe(302);
    expect(second.headers.location).toBe(`${APP_BASE_URL}/dashboard/${tenant.id}?connected=1`);

    const rows = await pool.query("select tenant_id from meta_tokens where instagram_account_id = 'acct-1'");
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].tenant_id).toBe(tenant.id);
  });

  // Identity Refactor U5: the resolve-by-profile.id heuristic (R5-01) is
  // gone — an account already attached to a DIFFERENT tenant is now a
  // named error, not something silently re-parented.
  it("rejects connecting an Instagram account that's already attached to a different tenant", async () => {
    const pool = getPool();
    const { tenant: tenantA, authHeader: authHeaderA } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const { tenant: tenantB, authHeader: authHeaderB } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-b");
    const app = createApp();

    mockSuccessfulExchange("shared-acct");
    const agentA = request.agent(app);
    const startUrlA = await mintStartUrl(app, tenantA.id, authHeaderA);
    const startA = await agentA.get(startUrlA);
    const stateA = extractState(startA.headers.location);
    const callbackA = await agentA.get("/auth/instagram/callback").query({ code: "auth-code", state: stateA });
    expect(callbackA.status).toBe(302);
    expect(callbackA.headers.location).toContain("/dashboard/");

    mockSuccessfulExchange("shared-acct"); // tenant B tries to connect the SAME Instagram account
    const agentB = request.agent(app);
    const startUrlB = await mintStartUrl(app, tenantB.id, authHeaderB);
    const startB = await agentB.get(startUrlB);
    const stateB = extractState(startB.headers.location);
    const callbackB = await agentB.get("/auth/instagram/callback").query({ code: "auth-code", state: stateB });

    expect(callbackB.status).toBe(302);
    expect(callbackB.headers.location).toBe(`${APP_BASE_URL}/connect?error=account_already_connected`);

    const rows = await pool.query("select tenant_id from meta_tokens where instagram_account_id = 'shared-acct'");
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].tenant_id).toBe(tenantA.id); // never re-parented to tenant B
  });

  it("callback redirects to the retry screen when Instagram's own token exchange fails", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET_FOR_TESTS, "creator-a");
    const app = createApp();
    const agent = request.agent(app);
    const startUrl = await mintStartUrl(app, tenant.id, authHeader);
    const start = await agent.get(startUrl);
    const state = extractState(start.headers.location);

    vi.mocked(exchangeCodeForShortLivedToken).mockRejectedValue(new Error("Instagram rejected the code"));

    const res = await agent.get("/auth/instagram/callback").query({ code: "bad-code", state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_BASE_URL}/connect?error=connection_failed`);

    const tokens = await pool.query("select count(*)::int as count from meta_tokens");
    expect(tokens.rows[0].count).toBe(0);
  });

  it("callback rejects a request missing code or state, redirecting to the retry screen", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/instagram/callback").query({ code: "only-code" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_BASE_URL}/connect?error=missing_params`);
  });
});
