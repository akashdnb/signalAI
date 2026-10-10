/**
 * Sends DMs via Instagram's Send API.
 *
 * SignalAI keeps plain text as the safe default. When the composed message
 * ends with a HTTPS CTA URL (the existing campaign CTA flow), we use
 * Instagram's button template instead. Instagram renders that payload as a
 * structured message card rather than a plain text bubble.
 */
const GRAPH_BASE_URL = "https://graph.instagram.com";
const SEND_TIMEOUT_MS = 8000;
const BUTTON_TEMPLATE_TEXT_LIMIT = 640;
const TRAILING_HTTPS_URL = /\s(https:\/\/[^\s]+)$/i;

export interface SendInstagramMessageResult {
  /** Meta's own id for this send (Send API response's `message_id`). */
  metaMessageId: string | null;
}

interface InstagramMessagePayload {
  text?: string;
  attachment?: {
    type: "template";
    payload: {
      template_type: "button";
      text: string;
      buttons: Array<{
        type: "web_url";
        url: string;
        title: string;
      }>;
    };
  };
}

/**
 * Converts an existing CTA-appended reply into Instagram's Button Template.
 *
 * We deliberately activate this from the existing CTA link instead of adding
 * a second campaign setting: old campaigns without a CTA remain byte-for-byte
 * equivalent plain-text sends, while campaigns already configured with a CTA
 * get the richer presentation automatically.
 *
 * The URL is removed from the visible body because Instagram renders it as a
 * real CTA button. If the body is too long for the template, we keep the
 * original text payload rather than truncating an AI response.
 */
function buildMessagePayload(text: string): InstagramMessagePayload {
  const match = text.match(TRAILING_HTTPS_URL);
  if (!match) return { text };

  const url = match[1];
  const body = text.slice(0, match.index).trim();
  if (!body || body.length > BUTTON_TEMPLATE_TEXT_LIMIT) return { text };

  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: body,
        buttons: [
          {
            type: "web_url",
            url,
            title: "View details",
          },
        ],
      },
    },
  };
}

export async function sendInstagramMessage(
  accessToken: string,
  recipientInstagramUserId: string,
  text: string,
): Promise<SendInstagramMessageResult> {
  // Keep the token in the Authorization header rather than the URL so it
  // doesn't appear in request-line logs, proxies, or APM traces.
  const url = `${GRAPH_BASE_URL}/v21.0/me/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientInstagramUserId },
      message: buildMessagePayload(text),
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Instagram send failed: ${res.status} ${bodyText.slice(0, 200)}`);
  }

  const body = (await res.json()) as { message_id?: string };
  return { metaMessageId: typeof body.message_id === "string" ? body.message_id : null };
}

/**
 * Posts a PUBLIC reply under a comment (Meta's `POST /{ig-comment-id}/replies`).
 */
export async function sendInstagramCommentReply(
  accessToken: string,
  commentId: string,
  text: string,
): Promise<void> {
  const url = `${GRAPH_BASE_URL}/v21.0/${encodeURIComponent(commentId)}/replies`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message: text }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Instagram comment reply failed: ${res.status} ${bodyText.slice(0, 200)}`);
  }
}
