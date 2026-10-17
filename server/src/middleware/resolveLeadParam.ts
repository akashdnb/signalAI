import type { NextFunction, Request, Response } from "express";
import { getPool } from "../db/pool.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Lead detail URLs are UUID-based. Older clients/bookmarks could still carry
 * the Instagram username in :leadId, which PostgreSQL correctly rejects when
 * it is bound to the UUID column. Resolve that legacy form once at the router
 * boundary so every downstream lead/deal/tag lookup receives the canonical
 * lead UUID.
 *
 * Username lookup is tenant-scoped and only succeeds when exactly one active
 * lead matches. We deliberately do not guess across multiple connected
 * Instagram accounts in the same workspace.
 */
export async function resolveLeadParam(req: Request, res: Response, next: NextFunction, rawLeadId: string) {
  if (UUID_PATTERN.test(rawLeadId)) return next();

  const tenantId = req.params.tenantId;
  if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

  const result = await getPool().query<{ id: string }>(
    `select l.id
       from leads l
       join lead_pii p on p.lead_id = l.id
      where l.tenant_id = $1
        and p.username = $2
        and p.deleted_at is null
      group by l.id
      order by max(p.created_at) desc
      limit 2`,
    [tenantId, rawLeadId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "lead not found for this tenant" });
  }
  if (result.rows.length > 1) {
    return res.status(409).json({ error: "lead username is ambiguous in this workspace; use the lead UUID" });
  }

  req.params.leadId = result.rows[0]!.id;
  return next();
}
