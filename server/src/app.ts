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
import { dashboardReadCacheHeaders } from "./lib/cacheHeaders.js";
import { healthRouter } from "./routes/health.js";
import { legalRouter } from "./routes/legal.js";
import { dataDeletionRouter } from "./routes/dataDeletion.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { authRouter } from "./routes/auth.js";
import { authEmailRouter } from "./routes/authEmail.js";
import { googleAuthRouter } from "./routes/authGoogle.js";
import { mcpOAuthRouter } from "./routes/mcpOAuth.js";
import { profileRouter } from "./routes/profile.js";
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
import { workspacesRouter } from "./routes/workspaces.js";
import { billingAccountsRouter } from "./routes/billingAccounts.js";
import { mcpCapabilitiesRouter } from "./routes/mcpCapabilities.js";
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

  app.set("trust proxy", true);

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", config.webAppOrigin);
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.urlencoded({ extended: false }));

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

  const instagramWebhookVerifyToken = config.metaWebhookVerifyToken;
  const instagramAppSecret = config.metaAppSecret;

  if (instagramWebhookVerifyToken && instagramAppSecret) {
    app.use(createProductionInstagramWebhookRouter(getPool()));
  }

  app.use(authRouter);
  app.use(authEmailRouter);
  app.use(googleAuthRouter);
  app.use(mcpOAuthRouter);
  app.use(profileRouter);
  app.use(workspacesRouter);
  app.use(billingAccountsRouter);
  app.use(workspaceManagementRouter);

  // Client-facing SignalAI MCP read boundary. It is service-authenticated
  // and tenant-scoped; the MCP service never receives database credentials.
  app.use(mcpCapabilitiesRouter);

  app.use(paginationRouter);
  // Content media enrichment is registered before the legacy campaigns
  // implementation so the shared observed-media endpoint uses the
  // multi-account-safe metadata refresh path.
  app.use(contentRouter);
  app.use(campaignsRouter);
  app.use(journeyRuntimeRouter);
  app.use(billingRouter);

  // Dashboard reads are personalized tenant data. Limit browser revalidation
  // to this authenticated dashboard surface instead of applying cache headers
  // globally to auth, webhooks, health, legal, and other sensitive endpoints.
  app.use("/tenants/:tenantId", dashboardReadCacheHeaders);
  app.use(dashboardRouter(options?.llmProvider, options?.embeddingProvider ?? null));

  app.use(leadsRouter);
  app.use(knowledgeBaseRouter(options?.embeddingProvider ?? null));
  app.use(guardrailsConfigRouter);
  app.use(leadScoringRulesRouter);
  app.use(fieldDefinitionsRouter);
  app.use(onboardingRouter);

  // Last middleware = error handler.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    Sentry.captureException(err);
    console.error("Unhandled route error:", err);
    if (res.headersSent) return;

    const isObject = err !== null && typeof err === "object";
    const statusCode =
      isObject && "statusCode" in err && typeof (err as { statusCode?: unknown }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;
    const expose = isObject && "expose" in err && (err as { expose?: unknown }).expose === true;
    const safeStatusCode = statusCode >= 400 && statusCode < 500 ? statusCode : 500;

    if (expose && safeStatusCode < 500 && err instanceof Error) {
      return res.status(safeStatusCode).json({ error: err.message });
    }

    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
