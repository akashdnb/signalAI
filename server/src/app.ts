import express from "express";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.js";
import { legalRouter } from "./routes/legal.js";
import { dataDeletionRouter } from "./routes/dataDeletion.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { authRouter } from "./routes/auth.js";
import { authEmailRouter } from "./routes/authEmail.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { billingRouter } from "./routes/billing.js";
import { dashboardRouter } from "./routes/dashboard.js";
import type { LLMProvider } from "./llm/provider.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export function createApp(options?: { llmProvider?: LLMProvider }) {
  const app = express();

  // Render terminates TLS and proxies to this process — without this,
  // req.ip is the proxy's address for every request, which would make
  // authEmail.ts's per-IP magic-link rate limit count all traffic as one
  // IP instead of rate-limiting the actual caller.
  app.set("trust proxy", true);

  // BUI (the creator-facing React app) runs on a different origin in dev
  // (Vite's dev server) and, until a reverse proxy is set up, in
  // production too. No cookies cross this boundary — R10-01's session is
  // a bearer token (Authorization header), specifically to avoid the
  // SameSite=None/Access-Control-Allow-Credentials surface a cross-origin
  // session cookie would need — so this only needs to allow the header.
  //
  // R12-01/R12-02 fix: no longer falls back to "*" when unconfigured — a
  // wildcard here would let any origin script this API with a bearer
  // token obtained some other way, and that's not something to arrive at
  // silently. Routed through config.ts (R12-02) rather than reading
  // process.env directly, and validated at boot (assertWebAppOriginConfigured
  // in index.ts) with the same "fail at boot, not silently" treatment
  // SESSION_SECRET already gets.
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", config.webAppOrigin);
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Meta's Data Deletion Callback posts form-encoded, not JSON.
  app.use(express.urlencoded({ extended: false }));

  // Webhook signature verification needs the exact raw bytes Meta/Stripe
  // signed — capture them here before json() discards access to the
  // original buffer.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );

  app.use(healthRouter);
  app.use(legalRouter);
  app.use(dataDeletionRouter);
  app.use(webhooksRouter);
  app.use(authRouter);
  app.use(authEmailRouter);
  app.use(campaignsRouter);
  app.use(billingRouter);
  app.use(dashboardRouter(options?.llmProvider));

  return app;
}
