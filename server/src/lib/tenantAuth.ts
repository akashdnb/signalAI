import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { verifySessionToken } from "./session.js";
import { getPool } from "../db/pool.js";
import { getUserSessionVersion } from "../db/users.js";
import { isTenantMember } from "../db/tenantMembers.js";

export type TenantRole = "owner" | "admin" | "member";
export type WorkspacePermission =
  | "workspace:view"
  | "workspace:edit"
  | "members:view"
  | "members:manage"
  | "instagram:view"
  | "instagram:connect"
  | "journey:view"
  | "journey:edit"
  | "billing:view"
  | "billing:manage";

const ROLE_PERMISSIONS: Readonly<Record<TenantRole, ReadonlySet<WorkspacePermission>>> = {
  owner: new Set([
    "workspace:view", "workspace:edit", "members:view", "members:manage",
    "instagram:view", "instagram:connect", "journey:view", "journey:edit",
    "billing:view", "billing:manage",
  ]),
  admin: new Set([
    "workspace:view", "workspace:edit", "members:view", "members:manage",
    "instagram:view", "instagram:connect", "journey:view", "journey:edit",
    "billing:view",
  ]),
  member: new Set(["workspace:view", "members:view", "instagram:view", "journey:view", "journey:edit", "billing:view"]),
};

export function roleHasPermission(role: TenantRole, permission: WorkspacePermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export interface AuthenticatedSession {
  userId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set only after bearer session and tenant membership have been verified. */
      tenantSession?: AuthenticatedSession;
    }
  }
}

export async function verifyBearerSession(req: Request): Promise<AuthenticatedSession | null> {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return null;

  const payload = verifySessionToken(config.sessionSecret, token);
  if (!payload) return null;

  const currentVersion = await getUserSessionVersion(getPool(), payload.userId);
  if (currentVersion === null || payload.sessionVersion !== currentVersion) return null;

  return { userId: payload.userId };
}

export async function requireTenantSession(req: Request, res: Response, next: NextFunction) {
  const session = await verifyBearerSession(req);
  if (!session) return res.status(401).json({ error: "missing or invalid session" });

  if (!(await isTenantMember(getPool(), req.params.tenantId!, session.userId))) {
    return res.status(403).json({ error: "not a member of this tenant" });
  }

  req.tenantSession = session;
  return next();
}

/**
 * Central role authorization for a tenant identified by the route parameter.
 * Membership and role are resolved together; client-supplied workspace IDs
 * are never accepted as proof of access.
 */
export function requireTenantRole(...allowedRoles: TenantRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = await verifyBearerSession(req);
    if (!session) return res.status(401).json({ error: "missing or invalid session" });

    const result = await getPool().query<{ role: TenantRole }>(
      `select role from tenant_members where tenant_id = $1 and user_id = $2 limit 1`,
      [req.params.tenantId, session.userId],
    );
    const role = result.rows[0]?.role;
    if (!role) return res.status(403).json({ error: "not a member of this tenant" });
    if (!allowedRoles.includes(role)) return res.status(403).json({ error: "insufficient tenant role" });

    req.tenantSession = session;
    return next();
  };
}

/** Explicit permission middleware for routes that do not map cleanly to a role allow-list. */
export function requireTenantPermission(permission: WorkspacePermission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = await verifyBearerSession(req);
    if (!session) return res.status(401).json({ error: "missing or invalid session" });

    const result = await getPool().query<{ role: TenantRole }>(
      `select role from tenant_members where tenant_id = $1 and user_id = $2 limit 1`,
      [req.params.tenantId, session.userId],
    );
    const role = result.rows[0]?.role;
    if (!role) return res.status(403).json({ error: "not a member of this tenant" });
    if (!roleHasPermission(role, permission)) return res.status(403).json({ error: "insufficient tenant permission" });

    req.tenantSession = session;
    return next();
  };
}
