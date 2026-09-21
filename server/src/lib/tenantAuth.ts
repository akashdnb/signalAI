import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { verifySessionToken } from "./session.js";
import { getPool } from "../db/pool.js";
import { getUserSessionVersion } from "../db/users.js";
import { isTenantMember } from "../db/tenantMembers.js";

export interface AuthenticatedSession {
  userId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Set by requireTenantSession once membership is verified. Phase 2A
       * is the first thing that needed "which user did this" past the
       * auth check itself (notes/pipeline/handoff/tag activity all record
       * an actor) — no route before it read this, so nothing set it.
       */
      tenantSession?: AuthenticatedSession;
    }
  }
}

/**
 * Verifies the bearer session on its own, with no notion of which tenant
 * (if any) the caller is asking about — shared by `requireTenantSession`
 * below (which additionally checks membership against a `:tenantId` route
 * param) and `/auth/instagram/start` (Identity Refactor U4), which checks
 * membership against a `tenantId` QUERY param instead, so it can't reuse
 * the route-param-shaped middleware directly.
 */
export async function verifyBearerSession(req: Request): Promise<AuthenticatedSession | null> {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return null;

  const payload = verifySessionToken(config.sessionSecret, token);
  if (!payload) return null;

  // Requires the token's sessionVersion to match the user's CURRENT value.
  // Without this, the only way to invalidate one leaked 30-day token was
  // rotating SESSION_SECRET, which signs out every user at once.
  const currentVersion = await getUserSessionVersion(getPool(), payload.userId);
  if (currentVersion === null || payload.sessionVersion !== currentVersion) return null;

  return { userId: payload.userId };
}

/**
 * Gates every route that reads or writes one tenant's data. Verifies the
 * bearer session, then checks `tenant_members` for `:tenantId` — a valid
 * session for a user who is not a member of that tenant is rejected
 * exactly like one with no session at all, never silently rescoped to a
 * tenant the caller IS a member of.
 */
export async function requireTenantSession(req: Request, res: Response, next: NextFunction) {
  const session = await verifyBearerSession(req);
  if (!session) {
    return res.status(401).json({ error: "missing or invalid session" });
  }

  if (!(await isTenantMember(getPool(), req.params.tenantId!, session.userId))) {
    return res.status(403).json({ error: "not a member of this tenant" });
  }

  req.tenantSession = session;
  return next();
}
