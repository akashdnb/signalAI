import type { Pool } from "pg";
import { listTokensDueForRefresh, markTokenError, upsertToken, getDecryptedToken } from "../db/tokens.js";
import { refreshLongLivedToken } from "../lib/instagramOAuth.js";

const REFRESH_WINDOW_DAYS = 5; // refresh comfortably before a 60-day token expires

export interface RefreshResult {
  tenantId: string;
  instagramAccountId: string;
  ok: boolean;
  error?: string;
}

/**
 * Account Health Monitoring's active half — Phase 1 Account & Authentication.
 * Run on a schedule (see queue/tokenRefreshQueue.ts); failures are recorded
 * on the row (status='error') rather than thrown, so one bad account never
 * stops the rest of the batch, and the caller can turn the results into a
 * Telegram alert once B11 wires that up.
 */
export async function runTokenRefreshSweep(pool: Pool, keyring: Map<string, Buffer>): Promise<RefreshResult[]> {
  const due = await listTokensDueForRefresh(pool, REFRESH_WINDOW_DAYS);
  const results: RefreshResult[] = [];

  for (const token of due) {
    try {
      const current = await getDecryptedToken(pool, keyring, token.tenantId, token.instagramAccountId);
      if (!current) {
        throw new Error("Token row disappeared between listing and refresh");
      }

      const refreshed = await refreshLongLivedToken(current);
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

      await upsertToken(pool, keyring, {
        tenantId: token.tenantId,
        instagramAccountId: token.instagramAccountId,
        accessToken: refreshed.access_token,
        expiresAt,
      });

      results.push({ tenantId: token.tenantId, instagramAccountId: token.instagramAccountId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markTokenError(pool, token.tenantId, token.instagramAccountId, message);
      results.push({
        tenantId: token.tenantId,
        instagramAccountId: token.instagramAccountId,
        ok: false,
        error: message,
      });
    }
  }

  return results;
}
