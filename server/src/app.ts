// Must be the first import: patches Express's router so a rejected
// promise in an async handler reaches error middleware via next(err)
// instead of becoming an unhandled rejection that kills the process
// (Express 4 doesn't do this on its own — every route handler here is
// async and none of them try/catch, so without this a single failed
// query takes down the whole server for every tenant, not just a 500
// for the one request).
import "express-async-errors";
import express from "express";
import { config } from "./config.js";
import { getPool } from "./db/pool.js";
import { Sentry } from "./lib/sentry.js";
import { healthRouter } from "./routes/health.js";
import { legalRouter } from "./routes/legal.js";
import { dataDeletionRouter } from "./routes/dataDeletion.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { authRouter } from "./routes/auth.js";
import { authEmailRouter } from "./routes/authEmail.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { journeyRuntimeRouter } from "./routes/journeyRuntime.js";
import { billingRouter } from "./routes/billing.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { leadsRouter } from "./routes/leads.js";
import { knowledgeBaseRouter } from "./routes/knowledgeBase.js";
import { guardrailsConfigRouter } from "./routes/guardrailsConfig.js";
import { leadScoringRulesRouter } from "./routes/leadScoringRules.js";
import { fieldDefinitionsRouter } from "./routes/fieldDefinitions.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { createProductionInstagramWebhookRouter } from "./integrations/instagram/webhooks/createInstagramWebhookRouter.js";
import type { LLMProvider } from "./llm/provider.js";
import type { EmbeddingProvider } from "./llm/embeddingProvider.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export function createApp(options?: { llmProvider?: LLMProvider; embeddingProvider?: EmbeddingProvider | null }) {
  const app = express();

  // Render terminates TLS and proxies to this process — without this,
  // req.ip is the proxy's address for every request, which would make
  // authEmail.ts's per-IP sign-in rate limit count all traffic as one
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

  // Instagram webhook uses req.rawBody captured by the global JSON middleware
  // above so Meta's HMAC signature is verified against the exact request bytes.
  const instagramWebhookVerifyToken =
    config.metaWebhookVerifyToken;

  const instagramAppSecret =
    config.metaAppSecret;

  if (
    instagramWebhookVerifyToken &&
    instagramAppSecret
  ) {
    app.use(
      createProductionInstagramWebhookRouter(
        getPool(),
      ),
    );
  }
  app.use(authRouter);
  app.use(authEmailRouter);
  app.use(campaignsRouter);
  app.use(journeyRuntimeRouter);
  app.use(billingRouter);
  app.use(dashboardRouter(options?.llmProvider, options?.embeddingProvider ?? null));
  app.use(leadsRouter);
  app.use(knowledgeBaseRouter(options?.embeddingProvider ?? null));
  app.use(guardrailsConfigRouter);
  app.use(leadScoringRulesRouter);
  app.use(fieldDefinitionsRouter);
  app.use(onboardingRouter);

  // Last middleware = error handler (Express identifies it by arity, not
  // position among app.use calls otherwise, but it only catches errors
  // from routes registered before it). Reports to Sentry and returns a
  // 500 instead of the alternative here: an unhandled rejection that
  // crashes the whole process for every tenant, not just this request.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    Sentry.captureException(err);
    console.error("Unhandled route error:", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
