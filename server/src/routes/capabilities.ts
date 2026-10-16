import { Router } from "express";
import { requireServiceAuth } from "../lib/serviceAuth.js";
import { CompanyCapability, CapabilityInputError } from "../capabilities/company.js";
import { ConnectorsClient, ConnectorError } from "../capabilities/connectorsClient.js";
import type { CompanyGetInput, CompanySearchInput } from "../capabilities/types.js";

export function capabilitiesRouter(companyCapability = new CompanyCapability(new ConnectorsClient())) {
  const router = Router();

  router.use("/internal/capabilities", requireServiceAuth);

  router.post("/internal/capabilities/company/search", async (req, res) => {
    const correlationId = req.header("x-correlation-id") ?? crypto.randomUUID();
    const context = {
      tenantId: req.capabilityContext!.tenantId,
      correlationId,
      actor: req.capabilityContext!.actor,
    } as const;

    try {
      const result = await companyCapability.search(req.body as CompanySearchInput, context);
      return res.status(200).json(result);
    } catch (error) {
      return handleCapabilityError(error, res);
    }
  });

  router.post("/internal/capabilities/company/get", async (req, res) => {
    const correlationId = req.header("x-correlation-id") ?? crypto.randomUUID();
    const context = {
      tenantId: req.capabilityContext!.tenantId,
      correlationId,
      actor: req.capabilityContext!.actor,
    } as const;

    try {
      const result = await companyCapability.get(req.body as CompanyGetInput, context);
      return res.status(200).json(result);
    } catch (error) {
      return handleCapabilityError(error, res);
    }
  });

  return router;
}

function handleCapabilityError(error: unknown, res: import("express").Response) {
  if (error instanceof CapabilityInputError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof ConnectorError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  throw error;
}
