import type { NextFunction, Request, Response } from "express";
import { capabilityConfig } from "../capabilities/capabilityConfig.js";

export function requireServiceAuth(req: Request, res: Response, next: NextFunction) {
  let expected: string;
  try {
    expected = capabilityConfig.serviceToken;
  } catch {
    return res.status(503).json({ error: "service authentication not configured" });
  }

  const provided = req.header("x-signalai-service-token");
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "invalid service credentials" });
  }

  const tenantId = req.header("x-signalai-tenant-id");
  if (!tenantId) return res.status(400).json({ error: "missing tenant context" });

  req.capabilityContext = { tenantId, actor: "service" };
  return next();
}

declare global {
  namespace Express {
    interface Request {
      capabilityContext?: { tenantId: string; actor: "service" };
    }
  }
}
