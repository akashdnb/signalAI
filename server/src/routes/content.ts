import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import {
  listKnownMediaForTenant,
  recordMediaMetadataRefreshFailure,
  upsertMediaMetadata,
} from "../db/mediaMetadata.js";
import { listConnectedInstagramAccounts } from "../db/connectedAccounts.js";
import { getDecryptedToken, resolveInstagramAccountIdForTenant } from "../db/tokens.js";
import { getTopKeywords, getTopPosts } from "../db/analytics.js";
import { fetchMediaMetadata } from "../lib/instagramMedia.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { Sentry } from "../lib/sentry.js";

const METADATA_REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
const MAX_METADATA_REFRESHES_PER_REQUEST = 20;
const MAX_METADATA_REFRESH_FAILURES = 3;
const METADATA_REFRESH_RETRY_DELAYS_MS = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

function retryDelayForFailure(failureCount: number): number {
  const boundedFailureCount = Math.min(Math.max(failureCount, 1), MAX_METADATA_REFRESH_FAILURES);
  return METADATA_REFRESH_RETRY_DELAYS_MS[boundedFailureCount - 1];
}

async function resolveAnalyticsAccountScope(
  tenantId: string,
  rawAccountId: unknown,
  res: Parameters<Parameters<typeof Router>[0]>[0],
): Promise<string | undefined | false> {
  if (rawAccountId === undefined) return undefined;
  if (typeof rawAccountId !== "string" || !rawAccountId.trim()) {
    res.status(400).json({ error: "accountId must be a single connected-account identifier" });
    return false;
  }
  const accountId = await resolveInstagramAccountIdForTenant(getPool(), tenantId, rawAccountId.trim());
  if (!accountId) {
    res.status(404).json({ error: "Instagram account not found for this workspace" });
    return false;
  }
  return accountId;
}

export const contentRouter = Router();

contentRouter.use("/tenants/:tenantId", requireTenantSession);

/**
 * Content is backed by the same observed-media set used by campaign
 * targeting, but this route owns presentation metadata enrichment. It never
 * assumes a tenant has exactly one Instagram account: stale metadata is
 * resolved using the tenant's healthy connected accounts until one credential
 * can read the media.
 */
contentRouter.get("/tenants/:tenantId/observed-media", async (req, res) => {
  const pool = getPool();
  const tenantId = req.params.tenantId;
  const rawAccountRowId = req.query.accountId;
  if (rawAccountRowId !== undefined && (typeof rawAccountRowId !== "string" || !rawAccountRowId.trim())) {
    return res.status(400).json({ error: "accountId must be a single connected-account identifier" });
  }
  const requestedAccountRowId = typeof rawAccountRowId === "string"
    ? rawAccountRowId.trim()
    : undefined;
  const resolvedInstagramAccountId = requestedAccountRowId
    ? await resolveInstagramAccountIdForTenant(pool, tenantId, requestedAccountRowId)
    : null;
  if (requestedAccountRowId && !resolvedInstagramAccountId) {
    return res.status(404).json({ error: "Instagram account not found for this workspace" });
  }
  const instagramAccountId = resolvedInstagramAccountId ?? undefined;
  let media = await listKnownMediaForTenant(pool, tenantId, instagramAccountId);
  const now = Date.now();

  const needsRefresh = media.filter((entry) => {
    const fetchedAt = entry.fetchedAt?.getTime() ?? 0;
    const retryAt = entry.refreshRetryAt?.getTime() ?? 0;
    const isStale = !fetchedAt || now - fetchedAt >= METADATA_REFRESH_AFTER_MS;
    const retryIsDue = retryAt <= now;
    return retryIsDue && (isStale || entry.refreshFailureCount > 0);
  });

  if (needsRefresh.length > 0) {
    const accounts = (await listConnectedInstagramAccounts(pool, tenantId)).filter(
      (account) => account.status === "healthy",
    );
    const accountsToTry = (instagramAccountId
      ? accounts.filter((account) => account.instagramAccountId === instagramAccountId)
      : accounts
    ).slice(0, 10);

    let refreshed = 0;
    for (const entry of needsRefresh) {
      if (refreshed >= MAX_METADATA_REFRESHES_PER_REQUEST || accountsToTry.length === 0) break;

      let enriched = false;
      let lastError: unknown = null;
      for (const account of accountsToTry) {
        try {
          const token = await getDecryptedToken(
            pool,
            config.tokenKeyring,
            tenantId,
            account.instagramAccountId,
          );
          if (!token) continue;

          const metadata = await fetchMediaMetadata(token, entry.mediaId);
          await upsertMediaMetadata(pool, tenantId, metadata, account.instagramAccountId);
          enriched = true;
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (enriched) {
        refreshed += 1;
      } else if (lastError) {
        const failureCount = Math.min(
          entry.refreshFailureCount + 1,
          MAX_METADATA_REFRESH_FAILURES,
        );
        const retryAt = new Date(Date.now() + retryDelayForFailure(failureCount));
        await recordMediaMetadataRefreshFailure(pool, tenantId, entry.mediaId, retryAt, instagramAccountId);
        Sentry.captureException(lastError);
      }
    }

    if (refreshed > 0) {
      media = await listKnownMediaForTenant(pool, tenantId, instagramAccountId);
    }
  }

  return res.status(200).json(media);
});

/** Analytics content signals use the same tenant session and optional connected-account scope as the content surface. */
contentRouter.get("/tenants/:tenantId/analytics/top-posts", async (req, res) => {
  const scope = await resolveAnalyticsAccountScope(req.params.tenantId, req.query.accountId, res);
  if (scope === false) return;
  const posts = await getTopPosts(getPool(), req.params.tenantId, 10, scope);
  return res.status(200).json(posts);
});

contentRouter.get("/tenants/:tenantId/analytics/top-keywords", async (req, res) => {
  const scope = await resolveAnalyticsAccountScope(req.params.tenantId, req.query.accountId, res);
  if (scope === false) return;
  const keywords = await getTopKeywords(getPool(), req.params.tenantId, 10, scope);
  return res.status(200).json(keywords);
});
