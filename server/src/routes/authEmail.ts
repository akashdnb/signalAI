import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { findOrCreateUserByEmail, getUserSessionVersion, normalizeEmail } from "../db/users.js";
import { listTenantsForUser } from "../db/tenantMembers.js";
import { createTenantForUser } from "../db/tenants.js";
import { createMagicLinkToken, countRecentTokensForEmail, countRecentTokensForIp, spendMagicLinkToken } from "../db/magicLinkTokens.js";
import { sendMagicLinkEmail } from "../lib/resend.js";
import { createSessionToken } from "../lib/session.js";
import { Sentry } from "../lib/sentry.js";

export const authEmailRouter = Router();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_EMAIL = 5;
const MAX_REQUESTS_PER_IP = 20;

// Deliberately generic and identical for every outcome except a malformed
// request or a rate limit — see the request handler below for why.
const GENERIC_RESPONSE = { message: "If an account exists for that email, we've sent a sign-in link." };

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Identity Refactor U2: request a magic link. Always responds with the
 * SAME message regardless of whether the email is already registered —
 * "a valid email is required" is the only distinguishable failure, and it
 * fires on malformed input alone, never on account existence. That's what
 * keeps this from being an account-enumeration oracle. `findOrCreateUserByEmail`
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
    countRecentTokensForEmail(pool, normalized, RATE_LIMIT_WINDOW_MS),
    ip ? countRecentTokensForIp(pool, ip, RATE_LIMIT_WINDOW_MS) : Promise.resolve(0),
  ]);
  if (emailCount >= MAX_REQUESTS_PER_EMAIL || ipCount >= MAX_REQUESTS_PER_IP) {
    // A rate-limit response doesn't reveal whether the email exists — it's
    // keyed on the email string and the caller's IP, not on a DB lookup.
    return res.status(429).json({ error: "too many sign-in requests — please wait before trying again" });
  }

  try {
    await findOrCreateUserByEmail(pool, normalized);
    const token = await createMagicLinkToken(pool, normalized, ip);
    const verifyUrl = `${config.apiBaseUrl}/auth/email/verify?token=${encodeURIComponent(token)}`;
    await sendMagicLinkEmail(normalized, verifyUrl);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to send magic-link email:", err);
    Sentry.captureException(err);
    // Still the generic response — a send failure must not leak
    // existence either, and the user can always ask for another link.
  }

  return res.status(200).json(GENERIC_RESPONSE);
});

/**
 * Identity Refactor U2/U6: a real browser lands here via the emailed link
 * (a top-level navigation), not a fetch from the SPA — same reasoning as
 * the Instagram callback (routes/auth.ts): every outcome redirects back
 * into BUI rather than returning raw JSON. `/login?error=...` is the retry
 * screen; `/login/verify` is where BUI reads the session out of the URL
 * FRAGMENT (never a query param — never sent in a Referer header or
 * server logs) and strips it via history.replaceState (R11-01).
 */
authEmailRouter.get("/auth/email/verify", async (req, res) => {
  const token = req.query.token;
  if (typeof token !== "string" || !token) {
    return res.redirect(`${config.appBaseUrl}/login?error=missing_token`);
  }

  const pool = getPool();
  const spent = await spendMagicLinkToken(pool, token);
  if (!spent) {
    return res.redirect(`${config.appBaseUrl}/login?error=invalid_or_expired`);
  }

  try {
    const user = await findOrCreateUserByEmail(pool, spent.email);

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
    return res.redirect(`${config.appBaseUrl}/login/verify?tenantId=${tenantId}#token=${sessionToken}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Magic-link verification failed after a valid token was spent:", err);
    Sentry.captureException(err);
    return res.redirect(`${config.appBaseUrl}/login?error=verification_failed`);
  }
});
