import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { verifySessionToken } from "../../lib/session.js";
import { listTenantsForUser } from "../../db/tenantMembers.js";
import { getUserByEmail } from "../../db/users.js";

vi.mock("../../lib/resend.js", () => ({ sendMagicLinkEmail: vi.fn(async () => {}) }));
import { sendMagicLinkEmail } from "../../lib/resend.js";

const SESSION_SECRET = "test-session-secret";
const APP_BASE_URL = "https://app.example.com";
const API_BASE_URL = "https://api.example.com";

/** Pulls the raw token out of the URL sendMagicLinkEmail was called with — standing in for "the user clicked the link in their inbox". */
function tokenFromLastEmail(): string {
  const [, verifyUrl] = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)!;
  return new URL(verifyUrl).searchParams.get("token")!;
}

describe("authEmail routes (Identity Refactor U2)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.APP_BASE_URL = APP_BASE_URL;
    process.env.API_BASE_URL = API_BASE_URL;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    vi.mocked(sendMagicLinkEmail).mockClear();
  });

  afterEach(() => {
    vi.mocked(sendMagicLinkEmail).mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await closePool();
  });

  it("rejects a malformed email with 400", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/email/request").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it("sends a magic link for a new email and creates the user", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/email/request").send({ email: "new@example.com" });

    expect(res.status).toBe(200);
    expect(sendMagicLinkEmail).toHaveBeenCalledTimes(1);
    const [emailArg, verifyUrl] = vi.mocked(sendMagicLinkEmail).mock.calls[0]!;
    expect(emailArg).toBe("new@example.com");
    expect(verifyUrl).toContain(`${API_BASE_URL}/auth/email/verify?token=`);

    expect(await getUserByEmail(getPool(), "new@example.com")).not.toBeNull();
  });

  // Enumeration-resistance: the response for a brand-new email and an
  // already-registered one must be identical.
  it("returns the exact same response whether or not the email is already registered", async () => {
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "existing@example.com" });

    const forNew = await request(app).post("/auth/email/request").send({ email: "brand-new@example.com" });
    const forExisting = await request(app).post("/auth/email/request").send({ email: "existing@example.com" });

    expect(forNew.status).toBe(forExisting.status);
    expect(forNew.body).toEqual(forExisting.body);
  });

  it("rate-limits repeated requests for the same email", async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/auth/email/request").send({ email: "spammed@example.com" });
      expect(res.status).toBe(200);
    }
    const sixth = await request(app).post("/auth/email/request").send({ email: "spammed@example.com" });
    expect(sixth.status).toBe(429);
  });

  it("verify redirects to the login-error screen for a missing token", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/email/verify");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_BASE_URL}/login?error=missing_token`);
  });

  it("verify redirects to the login-error screen for an unknown token", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/email/verify").query({ token: "not-a-real-token" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_BASE_URL}/login?error=invalid_or_expired`);
  });

  it("verify spends the token, creates a workspace on first login, and issues a valid session in the URL fragment", async () => {
    const pool = getPool();
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "first-timer@example.com" });
    const token = tokenFromLastEmail();

    const res = await request(app).get("/auth/email/verify").query({ token });
    expect(res.status).toBe(302);

    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe(`${APP_BASE_URL}/login/verify`);
    const tenantId = location.searchParams.get("tenantId");
    expect(tenantId).toBeTruthy();

    const sessionToken = location.hash.replace(/^#token=/, "");
    const payload = verifySessionToken(SESSION_SECRET, sessionToken);
    expect(payload).not.toBeNull();

    const user = await getUserByEmail(pool, "first-timer@example.com");
    const memberships = await listTenantsForUser(pool, user!.id);
    expect(memberships).toEqual([{ tenantId, role: "owner" }]);
    expect(payload!.userId).toBe(user!.id);
  });

  it("verify reuses the SAME workspace on a second login, rather than creating another", async () => {
    const pool = getPool();
    const app = createApp();

    await request(app).post("/auth/email/request").send({ email: "returning@example.com" });
    const firstToken = tokenFromLastEmail();
    const first = await request(app).get("/auth/email/verify").query({ token: firstToken });
    const firstTenantId = new URL(first.headers.location).searchParams.get("tenantId");

    await request(app).post("/auth/email/request").send({ email: "returning@example.com" });
    const secondToken = tokenFromLastEmail();
    const second = await request(app).get("/auth/email/verify").query({ token: secondToken });
    const secondTenantId = new URL(second.headers.location).searchParams.get("tenantId");

    expect(secondTenantId).toBe(firstTenantId);

    const user = await getUserByEmail(pool, "returning@example.com");
    const memberships = await listTenantsForUser(pool, user!.id);
    expect(memberships).toHaveLength(1); // still just the one workspace
  });

  it("a token can only be used once", async () => {
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "single-use@example.com" });
    const token = tokenFromLastEmail();

    const first = await request(app).get("/auth/email/verify").query({ token });
    expect(first.status).toBe(302);
    expect(first.headers.location).toContain("/login/verify");

    const replay = await request(app).get("/auth/email/verify").query({ token });
    expect(replay.status).toBe(302);
    expect(replay.headers.location).toBe(`${APP_BASE_URL}/login?error=invalid_or_expired`);
  });

  it("an expired token is rejected even though it was never used", async () => {
    const pool = getPool();
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "expired@example.com" });
    await pool.query("update magic_link_tokens set expires_at = now() - interval '1 minute'");
    const token = tokenFromLastEmail();

    const res = await request(app).get("/auth/email/verify").query({ token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_BASE_URL}/login?error=invalid_or_expired`);
  });

  it("still returns the generic response when the email fails to send", async () => {
    vi.mocked(sendMagicLinkEmail).mockRejectedValueOnce(new Error("Resend is down"));
    const app = createApp();
    const res = await request(app).post("/auth/email/request").send({ email: "will-fail@example.com" });
    expect(res.status).toBe(200); // does not leak that sending failed
  });
});
