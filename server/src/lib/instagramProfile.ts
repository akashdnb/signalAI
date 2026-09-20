/**
 * Resolves a username for an Instagram-scoped user id (IGSID) via Meta's
 * user-profile lookup — needed because, unlike the Comments webhook (whose
 * `from` object carries a username), the Messaging webhook only ever
 * supplies the sender's IGSID (see instagramWebhookParser.ts). A DM-only
 * lead — including one whose first contact is a shared Reel, still a
 * `messaging` event — would otherwise never get a username at all.
 *
 * Field names/shape follow Meta's published Instagram Messaging User
 * Profile API, not exercised against a live payload — VERIFY during pilot
 * testing, same caveat as instagramWebhookParser.ts/instagramSend.ts. A
 * mismatch here fails safe (returns null, logged and retried by the
 * caller's queue semantics) rather than throwing something misleading.
 */
const GRAPH_BASE_URL = "https://graph.instagram.com";
const FETCH_TIMEOUT_MS = 8000;

export async function fetchInstagramUsername(accessToken: string, instagramUserId: string): Promise<string | null> {
  const url = `${GRAPH_BASE_URL}/v21.0/${encodeURIComponent(instagramUserId)}?fields=username`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram profile lookup failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const body = (await res.json()) as { username?: string };
  return body.username ?? null;
}
