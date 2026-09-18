/**
 * Sends a DM via Instagram's messaging API. Field names follow Meta's
 * published Send API shape (shared with Messenger), not exercised against
 * a live app yet — VERIFY against a real payload during Phase 0 pilot
 * testing (A6), same caveat as instagramWebhookParser.ts.
 */
const GRAPH_BASE_URL = "https://graph.instagram.com";
const SEND_TIMEOUT_MS = 8000;

export async function sendInstagramMessage(
  accessToken: string,
  recipientInstagramUserId: string,
  text: string,
): Promise<void> {
  const url = new URL(`${GRAPH_BASE_URL}/v21.0/me/messages`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientInstagramUserId },
      message: { text },
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Instagram send failed: ${res.status} ${bodyText.slice(0, 200)}`);
  }
}
