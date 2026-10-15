import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";

describe("Google OAuth routes", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "test-session-secret-for-google-auth";
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.API_BASE_URL = "https://api.example.com";
    process.env.WEB_APP_ORIGIN = "https://app.example.com";
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  afterAll(async () => {
    await closePool();
  });

  it("redirects to login with a useful error when Google OAuth is not configured", async () => {
    const res = await request(createApp()).get("/auth/google/start");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("auth_error=google_not_configured");
  });

  it("starts an authorization-code flow with state, nonce, profile scope and an HttpOnly state cookie", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://api.example.com/auth/google/callback";
    const res = await request(createApp()).get("/auth/google/start?returnTo=https://attacker.example");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.example.com/auth/google/callback");
    expect(url.searchParams.get("scope")).toContain("openid email profile");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
    // `set-cookie` is typed as string but arrives as string[] at runtime;
    // normalize to an array before joining so this typechecks.
    const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";");
    expect(setCookie).toContain("signalai_google_oauth_state=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    const stateRows = await getPool().query("select count(*)::int as count from google_oauth_states");
    expect(stateRows.rows[0].count).toBe(1);
  });

  it("rejects an OAuth callback with no authorization code/state/cookie", async () => {
    const res = await request(createApp()).get("/auth/google/callback?code=abc&state=malformed");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("auth_error=invalid_google_state");
  });

  it("does not accept a handoff without a known single-use server record", async () => {
    const app = createApp();
    const missing = await request(app).post("/auth/google/exchange").send({ handoff: "A".repeat(43) });
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe("expired_google_handoff");

    const malformed = await request(app).post("/auth/google/exchange").send({ handoff: "bad" });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe("invalid_google_handoff");
  });

  it("exchanges an unexpired handoff only once and returns the profile fields", async () => {
    const payload = {
      tenantId: "tenant-test",
      token: "server-session-token",
      email: "person@example.com",
      firstName: "First",
      lastName: "Last",
      picture: "https://example.com/profile.png",
    };
    const { createHash, randomBytes } = await import("node:crypto");
    const handoff = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(handoff).digest("hex");
    await getPool().query(
      `insert into google_login_handoffs (token_hash, payload, expires_at)
       values ($1, $2::jsonb, now() + interval '2 minutes')`,
      [hash, JSON.stringify(payload)],
    );

    const app = createApp();
    const exchanged = await request(app).post("/auth/google/exchange").send({ handoff });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body).toEqual(payload);

    const replay = await request(app).post("/auth/google/exchange").send({ handoff });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe("expired_google_handoff");
  });

  it("rejects an expired handoff", async () => {
    const { createHash, randomBytes } = await import("node:crypto");
    const handoff = randomBytes(32).toString("base64url");
    await getPool().query(
      `insert into google_login_handoffs (token_hash, payload, expires_at)
       values ($1, $2::jsonb, now() - interval '1 second')`,
      [createHash("sha256").update(handoff).digest("hex"), JSON.stringify({ tenantId: "tenant-test" })],
    );
    const res = await request(createApp()).post("/auth/google/exchange").send({ handoff });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("expired_google_handoff");
  });
});
