import type {
  Request,
  Response,
  Router,
} from "express";

import express from "express";
import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";

import {
  getBoss,
} from "../queue/boss.js";

import {
  enqueueInstagramInboundEvent,
} from "../queue/instagramInboundQueue.js";

import {
  claimInstagramInboundEvent,
} from "../db/instagramInboundEvents.js";

import {
  resolveInstagramAccount,
} from "../integrations/instagram/webhooks/resolveInstagramAccount.js";

import {
  parseInstagramWebhook,
} from "../integrations/instagram/webhooks/parser.js";

import {
  verifyInstagramWebhookSignature,
} from "../integrations/instagram/webhooks/signature.js";

export interface InstagramWebhookDependencies {
  pool: Pool;
  runtime?: unknown;
  verifyToken: string;
  appSecret: string;
  boss?: PgBoss;
}

export function createInstagramWebhookRouter(
  dependencies: InstagramWebhookDependencies,
): Router {
  const router = express.Router();

  /*
   * Meta webhook verification.
   */
  router.get(
    "/instagram",
    (req: Request, res: Response) => {
      const mode =
        req.query["hub.mode"];

      const verifyToken =
        req.query["hub.verify_token"];

      const challenge =
        req.query["hub.challenge"];

      if (
        mode === "subscribe" &&
        verifyToken ===
          dependencies.verifyToken &&
        typeof challenge === "string"
      ) {
        res.status(200).send(
          challenge,
        );
        return;
      }

      res.sendStatus(403);
    },
  );

  /*
   * Important:
   * signature verification MUST happen against the raw request body.
   */
  router.post(
    "/instagram",
    (
      req: Request,
      _res: Response,
      next,
    ) => {
      if (!req.rawBody) {
        next(
          new Error(
            "Instagram webhook raw body is unavailable",
          ),
        );
        return;
      }

      next();
    },
    async (
      req: Request,
      res: Response,
    ) => {
      const rawBody =
        req.rawBody!;

      const signature =
        req.header(
          "x-hub-signature-256",
        );

      const valid =
        verifyInstagramWebhookSignature(
          rawBody,
          signature,
          dependencies.appSecret,
        );

      if (!valid) {
        res.sendStatus(401);
        return;
      }

      let payload: unknown;

      try {
        payload =
          JSON.parse(
            rawBody.toString(
              "utf8",
            ),
          );
      } catch {
        res.status(400).json({
          error: "invalid_json",
        });
        return;
      }

      const events =
        parseInstagramWebhook(
          payload,
        );

      /*
       * IMPORTANT:
       *
       * Do NOT send the 200 yet.
       *
       * Meta must only receive an acknowledgement after every accepted
       * event has been durably persisted AND its pg-boss job has been
       * inserted in the same PostgreSQL transaction.
       */
      let failed = false;

      for (const event of events) {
        try {
          const account =
            await resolveInstagramAccount(
              dependencies.pool,
              event.instagramAccountId,
            );

          if (!account) {
            console.warn(
              "Ignoring webhook for unknown Instagram account",
              event.instagramAccountId,
            );

            continue;
          }

          const boss =
            dependencies.boss ??
            await getBoss();

          const client =
            await dependencies.pool.connect();

          try {
            await client.query(
              "begin",
            );

            const claim =
              await claimInstagramInboundEvent(
                client,
                {
                  tenantId:
                    account.tenantId,
                  instagramAccountId:
                    account.id,
                  providerEventId:
                    event.providerEventId,
                  instagramUserId:
                    event.instagramUserId,
                  eventType:
                    event.eventType,
                  messageText:
                    event.messageText,
                  eventAt:
                    event.eventAt,
                  payload:
                    event.raw,
                },
              );

            /*
             * Duplicate provider delivery.
             *
             * The original event transaction already owns the durable
             * record and its queue job.
             */
            if (
              !claim.claimed ||
              !claim.event
            ) {
              await client.query(
                "commit",
              );
              continue;
            }

            await enqueueInstagramInboundEvent(
              boss,
              client,
              {
                inboundEventId:
                  claim.event.id,
                tenantId:
                  account.tenantId,
                instagramUserId:
                  event.instagramUserId,
                providerEventId:
                  event.providerEventId,
              },
            );

            await client.query(
              "commit",
            );
          } catch (error) {
            try {
              await client.query(
                "rollback",
              );
            } catch {
              // Preserve original error.
            }

            throw error;
          } finally {
            client.release();
          }
        } catch (error) {
          failed = true;

          console.error(
            "Instagram inbound event persistence/enqueue failed",
            {
              providerEventId:
                event.providerEventId,
              error,
            },
          );
        }
      }

      /*
       * If an event could not be durably stored+queued, do not acknowledge
       * the webhook. Meta can retry it.
       */
      if (failed) {
        res.sendStatus(500);
        return;
      }

      res.sendStatus(200);
    },
  );

  return router;
}
