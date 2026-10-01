import { Router } from "express";
import { JourneyRuntime } from "../domain/journey/runtime.js";
import { requireTenantSession } from "../lib/tenantAuth.js";

export const journeyRuntimeRouter = Router();

journeyRuntimeRouter.use(
  "/tenants/:tenantId",
  requireTenantSession,
);

/**
 * Start or resume the active journey for one subject.
 *
 * This is intentionally an internal/runtime API for now.
 * Instagram webhook integration will call the same runtime directly
 * instead of going through this HTTP endpoint.
 */
journeyRuntimeRouter.post(
  "/tenants/:tenantId/campaigns/:campaignId/journey/executions",
  async (req, res) => {
    const { tenantId, campaignId } = req.params;
    const { subjectKey, context } = req.body ?? {};

    if (
      typeof subjectKey !== "string" ||
      !subjectKey.trim()
    ) {
      return res.status(400).json({
        error: "subjectKey is required",
      });
    }

    if (
      context !== undefined &&
      (
        typeof context !== "object" ||
        context === null ||
        Array.isArray(context)
      )
    ) {
      return res.status(400).json({
        error: "context must be an object",
      });
    }

    const runtime = new JourneyRuntime();

    const result = await runtime.start({
      tenantId,
      campaignId,
      subjectKey: subjectKey.trim(),
      context,
    });

    return res.status(200).json(result);
  },
);

journeyRuntimeRouter.post(
  "/tenants/:tenantId/journey/executions/:executionId/resume",
  async (req, res) => {
    const { tenantId, executionId } = req.params;
    const { context } = req.body ?? {};

    if (
      context !== undefined &&
      (
        typeof context !== "object" ||
        context === null ||
        Array.isArray(context)
      )
    ) {
      return res.status(400).json({
        error: "context must be an object",
      });
    }

    const runtime = new JourneyRuntime();

    const result = await runtime.resume(
      tenantId,
      executionId,
      context,
    );

    return res.status(200).json(result);
  },
);
