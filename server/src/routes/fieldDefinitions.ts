import { Router } from "express";
import { getPool } from "../db/pool.js";
import {
  createFieldDefinition,
  deleteFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
} from "../db/fieldDefinitions.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

/**
 * Workstream 2 Field Definitions registry: lets a tenant define reusable,
 * typed fields (key, label, value type) once and get real per-type
 * validation across all their campaigns' milestones (see
 * milestoneEngine.ts's isValidCapturedValue). Route/mount convention copied
 * exactly from knowledgeBase.ts/guardrailsConfig.ts.
 */
export const fieldDefinitionsRouter = Router();

fieldDefinitionsRouter.use("/tenants/:tenantId", requireTenantSession);

fieldDefinitionsRouter.get("/tenants/:tenantId/field-definitions", async (req, res) => {
  const fieldDefinitions = await listFieldDefinitions(getPool(), req.params.tenantId!);
  return res.status(200).json({ fieldDefinitions });
});

fieldDefinitionsRouter.post("/tenants/:tenantId/field-definitions", async (req, res) => {
  try {
    const fieldDefinition = await createFieldDefinition(getPool(), req.params.tenantId!, {
      fieldKey: req.body?.fieldKey,
      label: req.body?.label,
      valueType: req.body?.valueType,
    });
    return res.status(201).json({ fieldDefinition });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: message });
  }
});

fieldDefinitionsRouter.patch("/tenants/:tenantId/field-definitions/:id", async (req, res) => {
  try {
    const fieldDefinition = await updateFieldDefinition(getPool(), req.params.tenantId!, req.params.id!, {
      label: req.body?.label,
      valueType: req.body?.valueType,
    });
    if (!fieldDefinition) {
      return res.status(404).json({ error: "field definition not found" });
    }
    return res.status(200).json({ fieldDefinition });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: message });
  }
});

fieldDefinitionsRouter.delete("/tenants/:tenantId/field-definitions/:id", async (req, res) => {
  const deleted = await deleteFieldDefinition(getPool(), req.params.tenantId!, req.params.id!);
  if (!deleted) {
    return res.status(404).json({ error: "field definition not found" });
  }
  return res.sendStatus(204);
});
