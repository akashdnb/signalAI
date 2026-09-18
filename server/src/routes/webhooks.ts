import { Router } from "express";
import { config } from "../config.js";
import { verifyWebhookSignature } from "../lib/webhookSignature.js";
import { parseInstagramWebhookPayload } from "../lib/instagramWebhookParser.js";
import { ingestWebhookEvent } from "../services/webhookIngestService.js";
import { getPool } from "../db/pool.js";
import { getBoss } from "../queue/boss.js";

export const webhooksRouter = Router();

// Meta's subscription verification handshake.
webhooksRouter.get("/webhooks/instagram", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.metaWebhookVerifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// The handler's entire job is: verify, persist, ack — in that order. No LLM
// calls, no sends (see src/services/webhookIngestService.ts and the B4
// worker for what happens next). Persistence happens BEFORE the 200: acking
// first and persisting after would tell Meta "received" right before a
// crash could lose the event with no retry to fall back on, since Meta
// only retries on a non-2xx response or a timeout.
webhooksRouter.post("/webhooks/instagram", async (req, res) => {
  const signature = req.header("X-Hub-Signature-256");
  const rawBody = req.rawBody;

  if (!rawBody || !verifyWebhookSignature(rawBody, signature, config.metaAppSecret)) {
    return res.sendStatus(403);
  }

  try {
    const events = parseInstagramWebhookPayload(req.body);
    const pool = getPool();
    const boss = await getBoss();
    for (const event of events) {
      await ingestWebhookEvent(pool, boss, event);
    }
    return res.sendStatus(200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Webhook ingestion failed — returning non-2xx so Meta retries:", err);
    return res.sendStatus(500);
  }
});
