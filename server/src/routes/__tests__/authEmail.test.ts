import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { verifySessionToken } from "../../lib/session.js";
import { listTenantsForUser } from "../../db/tenantMembers.js";
import { getUserByEmail } from "../../db/users.js";

vi.mock("../../lib/resend.js", () => ({ sendOtpEmail: vi.fn(async () => {}) }));
import { sendOtpEmail } from "../../lib/resend.js";

const SESSION_SECRET = "test-session-secret";
const APP_BASE_URL = "https://app.example.com";
const API_BASE_URL = "https://api.example.com";

/** Pulls the raw code out of the call sendOtpEmail was made with — standing in for "the user read the code out of their inbox". */
function codeFromLastEmail(): string {
  const [, code] = vi.mocked(sendOtpEmail).mock.calls.at(-1)!;
  return code;
}

describe("authEmail routes (email OTP)", () => {
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
    vi.mocked(sendOtpEmail).mockClear();
  });

  afterEach(() => {
    vi.mocked(sendOtpEmail).mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await closePool();
  });

  it("rejects a malformed email with 400", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/email/request").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it("sends a 6-digit code for a new email and creates the user", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/email/request").send({ email: "new@example.com" });

    expect(res.status).toBe(200);
    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
    const [emailArg, code] = vi.mocked(sendOtpEmail).mock.calls[0]!;
    expect(emailArg).toBe("new@example.com");
    expect(code).toMatch(/^\d{6}$/);

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

  it("verify rejects a malformed request (missing/invalid email or code)", async () => {
    const app = createApp();
    const noCode = await request(app).post("/auth/email/verify").send({ email: "a@b.com" });
    expect(noCode.status).toBe(400);

    const badCode = await request(app).post("/auth/email/verify").send({ email: "a@b.com", code: "12" });
    expect(badCode.status).toBe(400);
  });

  it("verify rejects an unknown code for an email that never requested one", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/email/verify").send({ email: "nobody@example.com", code: "000000" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_or_expired_code" });
  });

  it("verify spends the code, creates a workspace on first login, and returns a valid session directly in the JSON body", async () => {
    const pool = getPool();
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "first-timer@example.com" });
    const code = codeFromLastEmail();

    const res = await request(app).post("/auth/email/verify").send({ email: "first-timer@example.com", code });
    expect(res.status).toBe(200);

    const { tenantId, token } = res.body;
    expect(tenantId).toBeTruthy();
    const payload = verifySessionToken(SESSION_SECRET, token);
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
    const firstCode = codeFromLastEmail();
    const first = await request(app).post("/auth/email/verify").send({ email: "returning@example.com", code: firstCode });

    await request(app).post("/auth/email/request").send({ email: "returning@example.com" });
    const secondCode = codeFromLastEmail();
    const second = await request(app)
      .post("/auth/email/verify")
      .send({ email: "returning@example.com", code: secondCode });

    expect(second.body.tenantId).toBe(first.body.tenantId);

    const user = await getUserByEmail(pool, "returning@example.com");
    const memberships = await listTenantsForUser(pool, user!.id);
    expect(memberships).toHaveLength(1); // still just the one workspace
  });

  it("a code can only be used once", async () => {
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "single-use@example.com" });
    const code = codeFromLastEmail();

    const first = await request(app).post("/auth/email/verify").send({ email: "single-use@example.com", code });
    expect(first.status).toBe(200);

    const replay = await request(app).post("/auth/email/verify").send({ email: "single-use@example.com", code });
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({ error: "invalid_or_expired_code" });
  });

  it("an expired code is rejected even though it was never used", async () => {
    const pool = getPool();
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "expired@example.com" });
    await pool.query("update email_otp_codes set expires_at = now() - interval '1 minute'");
    const code = codeFromLastEmail();

    const res = await request(app).post("/auth/email/verify").send({ email: "expired@example.com", code });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_or_expired_code" });
  });

  // Brute-force protection: a 6-digit code has only 1,000,000 values, so
  // the verify endpoint caps guesses against one held code independent of
  // the request-rate limit (which only bounds how many codes get issued).
  it("locks out a code after 5 wrong guesses, even with a correct code still outstanding", async () => {
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "brute-force@example.com" });
    const realCode = codeFromLastEmail();
    const wrongCode = realCode === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/auth/email/verify").send({ email: "brute-force@example.com", code: wrongCode });
      expect(res.status).toBe(401);
    }

    const lockedOut = await request(app)
      .post("/auth/email/verify")
      .send({ email: "brute-force@example.com", code: realCode });
    expect(lockedOut.status).toBe(401);
    expect(lockedOut.body).toEqual({ error: "too_many_attempts" });
  });

  it("requesting a new code invalidates the previous one", async () => {
    const app = createApp();
    await request(app).post("/auth/email/request").send({ email: "superseded@example.com" });
    const firstCode = codeFromLastEmail();

    await request(app).post("/auth/email/request").send({ email: "superseded@example.com" });

    const res = await request(app).post("/auth/email/verify").send({ email: "superseded@example.com", code: firstCode });
    expect(res.status).toBe(401);
  });

  it("still returns the generic response when the email fails to send", async () => {
    vi.mocked(sendOtpEmail).mockRejectedValueOnce(new Error("Resend is down"));
    const app = createApp();
    const res = await request(app).post("/auth/email/request").send({ email: "will-fail@example.com" });
    expect(res.status).toBe(200); // does not leak that sending failed
  });
});
