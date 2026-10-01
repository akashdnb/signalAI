import { Router } from "express";
import { getPool } from "../db/pool.js";
import {
  listScoringRules,
  createScoringRule,
  updateScoringRule,
  deleteScoringRule,
  validateScoringRuleDefinition,
  validateScoringRuleName,
  validateScoringRulePoints,
} from "../db/leadScoringRules.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

/**
 * SLICE C: tenant-configurable custom lead-scoring rules — a clean
 * extension point on top of the deterministic base score (leadScoring.ts),
 * never an eval/expression target. Every route below is tenant-scoped via
 * requireTenantSession + the tenantId in every db/leadScoringRules.ts call.
 */
export const leadScoringRulesRouter = Router();

leadScoringRulesRouter.use("/tenants/:tenantId", requireTenantSession);

leadScoringRulesRouter.get("/tenants/:tenantId/scoring-rules", async (req, res) => {
  const rules = await listScoringRules(getPool(), req.params.tenantId!);
  return res.status(200).json({ rules });
});

leadScoringRulesRouter.post("/tenants/:tenantId/scoring-rules", async (req, res) => {
  try {
    const name = validateScoringRuleName(req.body?.name);
    const definition = validateScoringRuleDefinition(req.body?.definition);
    const points = validateScoringRulePoints(req.body?.points);
    const enabled = req.body?.enabled === undefined ? true : !!req.body.enabled;

    const rule = await createScoringRule(getPool(), req.params.tenantId!, { name, definition, points, enabled });
    return res.status(201).json({ rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: message });
  }
});

leadScoringRulesRouter.patch("/tenants/:tenantId/scoring-rules/:id", async (req, res) => {
  try {
    const name = req.body?.name !== undefined ? validateScoringRuleName(req.body.name) : undefined;
    const definition = req.body?.definition !== undefined ? validateScoringRuleDefinition(req.body.definition) : undefined;
    const points = req.body?.points !== undefined ? validateScoringRulePoints(req.body.points) : undefined;
    const enabled = req.body?.enabled !== undefined ? !!req.body.enabled : undefined;

    const rule = await updateScoringRule(getPool(), req.params.tenantId!, req.params.id!, { name, definition, points, enabled });
    if (!rule) return res.status(404).json({ error: "scoring rule not found for this tenant" });
    return res.status(200).json({ rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: message });
  }
});

leadScoringRulesRouter.delete("/tenants/:tenantId/scoring-rules/:id", async (req, res) => {
  const deleted = await deleteScoringRule(getPool(), req.params.tenantId!, req.params.id!);
  if (!deleted) return res.status(404).json({ error: "scoring rule not found for this tenant" });
  return res.status(204).send();
});
