import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

/**
 * Authenticates server-to-server callers before they can reach capability
 * endpoints. The service token is intentionally separate from tenant/user
 * authentication: internal callers are trusted adapters, but still have to
 * provide an explicit tenant context for tenant-owned capabilities.
 */
export function requireServiceAuth(req: Request, res: Response, next: NextFunction) {
  const expected = config.serviceToken;
  const provided = req.header("x-signalai-service-token");

  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ error: "invalid service credentials" });
  }

  const tenantId = req.header("x-signalai-tenant-id");
  if (!tenantId) {
    return res.status(400).json({ error: "missing tenant context" });
  }

  req.capabilityContext = {
    tenantId,
    actor: "service",
  };

  return next();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      capabilityContext?: {
        tenantId: string;
        actor: "service";
      };
    }
  }
}
