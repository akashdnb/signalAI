import "express-async-errors";
import express from "express";
import { config } from "./config.js";
import { getPool } from "./db/pool.js";
import { Sentry } from "./lib/sentry.js";
import { dashboardReadCacheHeaders } from "./lib/cacheHeaders.js";
import { healthRouter } from "./routes/health.js";
import { legalRouter } from "./routes/legal.js";
import { dataDeletionRouter } from "./routes/dataDeletion.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { authRouter } from "./routes/auth.js";
import { authEmailRouter } from "./routes/authEmail.js";
import { paginationRouter } from "./routes/pagination.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { contentRouter } from "./routes/content.js";
import { journeyRuntimeRouter } from "./routes/journeyRuntime.js";
import { billingRouter } from "./routes/billing.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { leadsRouter } from "./routes/leads.js";
import { knowledgeBaseRouter } from "./routes/knowledgeBase.js";
import { guardrailsConfigRouter } from "./routes/guardrailsConfig.js";
import { leadScoringRulesRouter } from "./routes/leadScoringRules.js";
import { fieldDefinitionsRouter } from "./routes/fieldDefinitions.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { workspaceManagementRouter } from "./routes/workspaceManagement.js";
import { capabilitiesRouter } from "./routes/capabilities.js";
import { createProductionInstagramWebhookRouter } from "./integrations/instagram/webhooks/createInstagramWebhookRouter.js";
import type { LLMProvider } from "./llm/provider.js";
import type { EmbeddingProvider } from "./llm/embeddingProvider.js";

declare global {
  namespace Express {
    interface Request { rawBody?: Buffer; }
  }
}

export function createApp(options?: { llmProvider?: LLMProvider; embeddingProvider?: EmbeddingProvider | null }) {
  const app = express();
  app.set("trust proxy", true);

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", config.webAppOrigin);
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ verify: (req, _res, buf) => { (req as express.Request).rawBody = buf; } }));

  app.use(healthRouter);
  app.use(legalRouter);
  app.use(dataDeletionRouter);
  app.use(webhooksRouter);

  const instagramWebhookVerifyToken = config.metaWebhookVerifyToken;
  const instagramAppSecret = config.metaAppSecret;
  if (instagramWebhookVerifyToken && instagramAppSecret) {
    app.use(createProductionInstagramWebhookRouter(getPool()));
  }

  app.use(authRouter);
  app.use(authEmailRouter);
  app.use(workspaceManagementRouter);
  app.use(capabilitiesRouter());

  app.use(paginationRouter);
  app.use(contentRouter);
  app.use(campaignsRouter);
  app.use(journeyRuntimeRouter);
  app.use(billingRouter);
  app.use("/tenants/:tenantId", dashboardReadCacheHeaders);
  app.use(dashboardRouter(options?.llmProvider, options?.embeddingProvider ?? null));
  app.use(leadsRouter);
  app.use(knowledgeBaseRouter(options?.embeddingProvider ?? null));
  app.use(guardrailsConfigRouter);
  app.use(leadScoringRulesRouter);
  app.use(fieldDefinitionsRouter);
  app.use(onboardingRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    Sentry.captureException(err);
    console.error("Unhandled route error:", err);
    if (res.headersSent) return;
    const isObject = err !== null && typeof err === "object";
    const statusCode = isObject && "statusCode" in err && typeof (err as { statusCode?: unknown }).statusCode === "number"
      ? (err as { statusCode: number }).statusCode : 500;
    const expose = isObject && "expose" in err && (err as { expose?: unknown }).expose === true;
    const safeStatusCode = statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    if (expose && safeStatusCode < 500 && err instanceof Error) return res.status(safeStatusCode).json({ error: err.message });
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
