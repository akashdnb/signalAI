import { config } from "../config.js";

/**
 * Resolves a username for an Instagram-scoped user id (IGSID) via Meta's
 * Instagram Messaging User Profile API. Messaging webhooks identify the
 * sender by IGSID, so DM-only contacts need this enrichment before the inbox
 * can display their handle.
 *
 * Instagram Login uses graph.instagram.com. Keep the base URL configurable so
 * the API version can be upgraded without changing application code.
 */
const FETCH_TIMEOUT_MS = 8000;

export async function fetchInstagramUsername(
  accessToken: string,
  instagramUserId: string,
): Promise<string | null> {
  const baseUrl = config.instagramProfileGraphApiBaseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/${encodeURIComponent(instagramUserId)}?fields=username`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Instagram profile lookup failed: ${res.status} ${body.slice(0, 200)}`,
    );
  }

  const body = (await res.json()) as { username?: string };
  return typeof body.username === "string" && body.username.length > 0
    ? body.username
    : null;
}
