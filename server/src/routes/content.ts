import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { listKnownMediaForTenant, upsertMediaMetadata } from "../db/mediaMetadata.js";
import { listConnectedInstagramAccounts } from "../db/connectedAccounts.js";
import { getDecryptedToken } from "../db/tokens.js";
import { fetchMediaMetadata } from "../lib/instagramMedia.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { Sentry } from "../lib/sentry.js";

const METADATA_REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
const MAX_METADATA_REFRESHES_PER_REQUEST = 20;

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
  let media = await listKnownMediaForTenant(pool, tenantId);
  const now = Date.now();

  const needsRefresh = media.filter((entry) => {
    const fetchedAt = entry.fetchedAt?.getTime() ?? 0;
    return !fetchedAt || now - fetchedAt >= METADATA_REFRESH_AFTER_MS;
  });

  if (needsRefresh.length > 0) {
    const accounts = (await listConnectedInstagramAccounts(pool, tenantId)).filter(
      (account) => account.status === "healthy",
    );
    const accountsToTry = accounts.slice(0, 10);

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
          await upsertMediaMetadata(pool, tenantId, metadata);
          enriched = true;
          break;
        } catch (err) {
          // A media id belongs to one connected account. A failed lookup on
          // one account is therefore expected when a workspace has multiple
          // accounts; try the next account before giving up.
          lastError = err;
        }
      }

      if (enriched) {
        refreshed += 1;
      } else if (lastError) {
        Sentry.captureException(lastError);
      }
    }

    if (refreshed > 0) {
      media = await listKnownMediaForTenant(pool, tenantId);
    }
  }

  return res.status(200).json(media);
});
