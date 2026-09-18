import { Router } from "express";
import { config } from "../config.js";
import { verifySignedRequest } from "../lib/metaSignedRequest.js";
import { getDeletionStatus, requestDeletion } from "../lib/deletionService.js";

export const dataDeletionRouter = Router();

// Meta's Data Deletion Callback: POST, form-encoded, one field `signed_request`.
dataDeletionRouter.post("/data-deletion", (req, res) => {
  const signedRequest = req.body?.signed_request;
  if (typeof signedRequest !== "string") {
    return res.status(400).json({ error: "missing signed_request" });
  }

  const payload = verifySignedRequest(signedRequest, config.metaAppSecret);
  if (!payload) {
    return res.status(403).json({ error: "invalid signature" });
  }

  const { confirmationCode } = requestDeletion(payload.user_id);
  const statusUrl = `${req.protocol}://${req.get("host")}/data-deletion/status/${confirmationCode}`;

  return res.status(200).json({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
});

dataDeletionRouter.get("/data-deletion/status/:code", (req, res) => {
  const status = getDeletionStatus(req.params.code);
  if (!status) {
    return res.status(404).json({ error: "unknown confirmation code" });
  }
  return res.status(200).json({ confirmation_code: req.params.code, status });
});
