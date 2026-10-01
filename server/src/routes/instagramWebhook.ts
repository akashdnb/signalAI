import type {
  Request,
  Response,
  Router,
} from "express";

import express from "express";
import type { Pool } from "pg";

import {
  resolveInstagramAccount,
} from "../integrations/instagram/webhooks/resolveInstagramAccount.js";

import {
  parseInstagramWebhook,
} from "../integrations/instagram/webhooks/parser.js";

import {
  verifyInstagramWebhookSignature,
} from "../integrations/instagram/webhooks/signature.js";

import {
  processInstagramMessage,
} from "../domain/journey/webhooks/processInstagramMessage.js";

import {
  JourneyRuntime,
} from "../domain/journey/runtime.js";

export interface InstagramWebhookDependencies {
  pool: Pool;
  runtime: JourneyRuntime;
  verifyToken: string;
  appSecret: string;
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
        verifyToken === dependencies.verifyToken &&
        typeof challenge === "string"
      ) {
        res.status(200).send(challenge);
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
    (req: Request, _res: Response, next) => {
      if (!req.rawBody) {
        next(new Error("Instagram webhook raw body is unavailable"));
        return;
      }

      next();
    },
    async (
      req: Request,
      res: Response,
    ) => {
      const rawBody = req.rawBody!;


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
        payload = JSON.parse(
          rawBody.toString("utf8"),
        );
      } catch {
        res.status(400).json({
          error: "invalid_json",
        });
        return;
      }

      const events =
        parseInstagramWebhook(payload);

      /*
       * Acknowledge the webhook immediately.
       *
       * Processing happens after acknowledgement.
       */
      res.sendStatus(200);

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

          await processInstagramMessage(
            {
              pool: dependencies.pool,
              runtime:
                dependencies.runtime,
            },
            {
              tenantId:
                account.tenantId,
              instagramAccountId:
                account.id,
              event,
            },
          );
        } catch (error) {
          console.error(
            "Instagram inbound event processing failed",
            {
              providerEventId:
                event.providerEventId,
              error,
            },
          );
        }
      }
    },
  );

  return router;
}
