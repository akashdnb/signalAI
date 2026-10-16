import { config } from "../config.js";

export type ProviderFailureClass = "retryable" | "permanent" | "not_configured";

export type ProviderDeliveryResult =
  | { ok: true; provider: "resend" | "telegram"; providerMessageId?: string }
  | { ok: false; provider: "resend" | "telegram"; failureClass: ProviderFailureClass; errorCode: string };

const TIMEOUT_MS = 8000;

function classifyHttpFailure(status: number): ProviderFailureClass {
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return "retryable";
  }
  return "permanent";
}

/** Sends email through the existing Resend account. A successful HTTP response is required. */
export async function deliverNotificationEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<ProviderDeliveryResult> {
  if (!config.resendApiKey) {
    return { ok: false, provider: "resend", failureClass: "not_configured", errorCode: "provider_not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.resendFromAddress,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      // Do not persist or log provider response bodies; they can contain recipient or provider details.
      return {
        ok: false,
        provider: "resend",
        failureClass: classifyHttpFailure(response.status),
        errorCode: response.status === 401 || response.status === 403
          ? "provider_credentials_or_sender_rejected"
          : response.status === 429
            ? "provider_rate_limited"
            : response.status >= 500
              ? "provider_unavailable"
              : "provider_rejected_request",
      };
    }
    let providerMessageId: string | undefined;
    try {
      const body = await response.json() as { id?: unknown };
      if (typeof body.id === "string" && body.id.length <= 200) providerMessageId = body.id;
    } catch {
      // The HTTP success result is still useful when a provider omits a JSON body.
    }
    return { ok: true, provider: "resend", ...(providerMessageId ? { providerMessageId } : {}) };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      provider: "resend",
      failureClass: "retryable",
      errorCode: timeout ? "provider_timeout" : "provider_network_error",
    };
  }
}

/**
 * Account-level Telegram alerts are configured with one server-wide chat and
 * are intentionally not offered as a per-user notification preference. This
 * provider is reserved for a future verified per-user destination flow.
 */
export async function deliverUserTelegramNotification(): Promise<ProviderDeliveryResult> {
  return {
    ok: false,
    provider: "telegram",
    failureClass: "not_configured",
    errorCode: "user_telegram_destination_unavailable",
  };
}
