import type { NextFunction, Request, Response } from "express";

const REVALIDATABLE_DASHBOARD_PATHS = new Set([
  "/",
  "/leads",
  "/analytics",
  "/analytics/funnel",
  "/analytics/revenue",
  "/analytics/timeseries",
]);

const REVALIDATABLE_CAMPAIGN_PATH = /^\/campaigns\/[^/]+\/(dropoff|analytics)$/;

/**
 * Cache policy for authenticated dashboard reads mounted at
 * /tenants/:tenantId. Only explicitly selected read-only dashboard endpoints
 * are revalidated. Account health is sensitive connection state and must
 * never be retained; all other tenant paths are left untouched.
 */
export function dashboardReadCacheHeaders(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  if (req.path === "/account") {
    res.setHeader("Cache-Control", "no-store");
    next();
    return;
  }

  const eligible =
    REVALIDATABLE_DASHBOARD_PATHS.has(req.path) || REVALIDATABLE_CAMPAIGN_PATH.test(req.path);
  if (eligible && req.get("Authorization")) {
    res.setHeader("Cache-Control", "private, no-cache");
    res.vary("Authorization");
  }

  next();
}
