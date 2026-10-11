import type { NextFunction, Request, Response } from "express";

/**
 * Cache policy for authenticated dashboard reads mounted at
 * /tenants/:tenantId. Personalized read-only responses may be retained in a
 * private browser cache but must be revalidated; account health is sensitive
 * connection state and must never be retained.
 */
export function dashboardReadCacheHeaders(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  if (req.path === "/account") {
    res.setHeader("Cache-Control", "no-store");
  } else {
    res.setHeader("Cache-Control", "private, no-cache");
    res.vary("Authorization");
  }
  next();
}
