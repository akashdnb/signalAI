import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { verifySessionToken } from "./session.js";

/**
 * R10-01 fix: gates every route that reads or writes one tenant's data.
 * Requires an `Authorization: Bearer <token>` header whose token verifies
 * and whose `tenantId` matches the `:tenantId` route param — a request
 * carrying a valid session for a DIFFERENT tenant is rejected exactly like
 * one with no session at all, not silently scoped to the wrong tenant.
 */
export function requireTenantSession(req: Request, res: Response, next: NextFunction) {
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

  return next();
}
