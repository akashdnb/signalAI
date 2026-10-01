import { Router } from "express";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { JourneyRuntime } from "../domain/journey/runtime.js";

export const journeyRuntimeRouter = Router();

journeyRuntimeRouter.use(
  "/tenants/:tenantId",
  requireTenantSession,
);

const runtime = new JourneyRuntime();

journeyRuntimeRouter.post(
  "/tenants/:tenantId/campaigns/:campaignId/journey/executions",
  async (req, res) => {
    const { tenantId, campaignId } = req.params;

    try {
      const result = await runtime.start({
        tenantId,
        campaignId,
        subjectKey: String(req.body.subjectKey),
        context: req.body.context ?? {},
      });

      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed to start journey",
      });
    }
  },
);

journeyRuntimeRouter.post(
  "/tenants/:tenantId/journey/executions/:executionId/events",
  async (req, res) => {
    const { tenantId, executionId } = req.params;

    const eventId = req.header(
      "Idempotency-Key",
    );

    if (!eventId) {
      return res.status(400).json({
        error:
          "Idempotency-Key header is required",
      });
    }

    if (!req.body.eventType) {
      return res.status(400).json({
        error: "eventType is required",
      });
    }

    try {
      const result =
        await runtime.resumeFromEvent({
          tenantId,
          executionId,
          eventId,
          eventType: req.body.eventType,
          payload: req.body.payload ?? {},
        });

      res.status(result.duplicateEvent ? 200 : 200)
        .json(result);
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed to process journey event",
      });
    }
  },
);
