import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { findOrCreateUserByEmail, getUserSessionVersion, normalizeEmail } from "../db/users.js";
import { listTenantsForUser } from "../db/tenantMembers.js";
import { createTenantForUser } from "../db/tenants.js";
import {
  createOtpCode,
  countRecentCodesForEmail,
  countRecentCodesForIp,
  recordFailedOtpAttempt,
  trySpendOtpCode,
} from "../db/emailOtpCodes.js";
import { sendOtpEmail } from "../lib/resend.js";
import { createSessionToken } from "../lib/session.js";
import { Sentry } from "../lib/sentry.js";

export const authEmailRouter = Router();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_EMAIL = 5;
const MAX_REQUESTS_PER_IP = 20;

// Deliberately generic and identical for every outcome except a malformed
// request or a rate limit — see the request handler below for why.
const GENERIC_RESPONSE = { message: "If an account exists for that email, we've sent a sign-in code." };

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value.trim());
}

/**
 * Request a 6-digit sign-in code. Always responds with the SAME message
 * regardless of whether the email is already registered — "a valid email
 * is required" is the only distinguishable failure, and it fires on
 * malformed input alone, never on account existence. That's what keeps
 * this from being an account-enumeration oracle. `findOrCreateUserByEmail`
 * runs the identical insert-on-conflict statement whether the user is new
 * or returning, which is also what keeps the *timing* similar without
 * needing an artificial delay.
 */
authEmailRouter.post("/auth/email/request", async (req, res) => {
  const { email } = req.body ?? {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "a valid email is required" });
  }

  const pool = getPool();
  const normalized = normalizeEmail(email);
  const ip = req.ip ?? null;

  const [emailCount, ipCount] = await Promise.all([
    countRecentCodesForEmail(pool, normalized, RATE_LIMIT_WINDOW_MS),
    ip ? countRecentCodesForIp(pool, ip, RATE_LIMIT_WINDOW_MS) : Promise.resolve(0),
  ]);
  if (emailCount >= MAX_REQUESTS_PER_EMAIL || ipCount >= MAX_REQUESTS_PER_IP) {
    // A rate-limit response doesn't reveal whether the email exists — it's
    // keyed on the email string and the caller's IP, not on a DB lookup.
    return res.status(429).json({ error: "too many sign-in requests — please wait before trying again" });
  }

  try {
    await findOrCreateUserByEmail(pool, normalized);
    const code = await createOtpCode(pool, config.sessionSecret, normalized, ip);
    await sendOtpEmail(normalized, code);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to send sign-in code email:", err);
    Sentry.captureException(err);
    // Still the generic response — a send failure must not leak
    // existence either, and the user can always ask for another code.
  }

  return res.status(200).json(GENERIC_RESPONSE);
});

/**
 * Verify the code and issue a session — a plain JSON call from the SPA
 * itself, not a top-level browser navigation. This is the whole point of
 * moving off magic links: no redirect, no leaving the tab, no session
 * token riding through a URL (fragment or otherwise) on its way back to
 * BUI. The client asks for this on the same page it collected the code.
 */
authEmailRouter.post("/auth/email/verify", async (req, res) => {
  const { email, code } = req.body ?? {};
  if (!isValidEmail(email) || !isValidCode(code)) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const pool = getPool();
  const normalized = normalizeEmail(email);

  const spent = await trySpendOtpCode(pool, config.sessionSecret, normalized, code.trim());
  if (!spent) {
    const attemptResult = await recordFailedOtpAttempt(pool, normalized);
    if (attemptResult === "locked") {
      return res.status(401).json({ error: "too_many_attempts" });
    }
    // "no_active_code" (expired, already used, or never requested) and a
    // plain wrong guess against a still-active code both read the same to
    // the caller: the code they typed doesn't work right now.
    return res.status(401).json({ error: "invalid_or_expired_code" });
  }

  try {
    const user = await findOrCreateUserByEmail(pool, normalized);

    // First login for this person bootstraps their one workspace — tenant
    // creation is no longer part of the Instagram connect flow (U4), so
    // this is the only place a tenant now comes into existence.
    let tenants = await listTenantsForUser(pool, user.id);
    if (tenants.length === 0) {
      // R14-05 fix: no PII in a display field — a tenant name renders in
      // the BUI header, in any tenant listing, and lands anywhere tenant
      // names get logged, none of which are scrubbable the way lead_pii is.
      const tenant = await createTenantForUser(pool, "My workspace", user.id);
      tenants = [{ tenantId: tenant.id, role: "owner" }];
    }
    const tenantId = tenants[0]!.tenantId;

    const sessionVersion = (await getUserSessionVersion(pool, user.id)) ?? 1;
    const sessionToken = createSessionToken(config.sessionSecret, user.id, sessionVersion);
    return res.status(200).json({ tenantId, token: sessionToken });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Sign-in verification failed after a valid code was spent:", err);
    Sentry.captureException(err);
    return res.status(500).json({ error: "verification_failed" });
  }
});
