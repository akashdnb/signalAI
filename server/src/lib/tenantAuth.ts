import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { verifySessionToken } from "./session.js";
import { getPool } from "../db/pool.js";
import { getTenantSessionVersion } from "../db/tenants.js";

/**
 * R10-01 fix: gates every route that reads or writes one tenant's data.
 * Requires an `Authorization: Bearer <token>` header whose token verifies
 * and whose `tenantId` matches the `:tenantId` route param — a request
 * carrying a valid session for a DIFFERENT tenant is rejected exactly like
 * one with no session at all, not silently scoped to the wrong tenant.
 *
 * R11-02 fix: also requires the token's `sessionVersion` to match the
 * tenant's CURRENT value in the database. Without this, the only way to
 * invalidate one leaked 30-day token was rotating SESSION_SECRET, which
 * signs out every tenant at once — `bumpSessionVersion` (db/tenants.ts)
 * now makes that a single per-tenant update instead.
 */
export async function requireTenantSession(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return res.status(401).json({ error: "missing session" });
  }

  const payload = verifySessionToken(config.sessionSecret, token);
  if (!payload) {
    return res.status(401).json({ error: "invalid or expired session" });
  }

  if (payload.tenantId !== req.params.tenantId) {
    return res.status(403).json({ error: "session does not match this tenant" });
  }

  // currentVersion === null covers both "this tenant no longer exists" and
  // an edge case that shouldn't happen in practice; either way there is no
  // session to be valid, so it's folded into the same rejection rather
  // than distinguished from "revoked" — that distinction isn't this
  // middleware's to make, and a route-specific 404 for a genuinely missing
  // tenant still happens further down, past this check.
  const currentVersion = await getTenantSessionVersion(getPool(), payload.tenantId);
  if (currentVersion === null || payload.sessionVersion !== currentVersion) {
    return res.status(401).json({ error: "invalid or expired session" });
  }

  return next();
}
