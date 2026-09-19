import { config } from "../config.js";

/**
 * B11: Telegram alerts for new leads and the operational alarms from B4,
 * B5, and B10. Modeled on the same graceful-degradation pattern as
 * sentry.ts and the LLM provider — safe to call with no bot configured
 * (local dev/test, or before the user sets up a bot), so every call site
 * needs no "is Telegram configured" branch of its own.
 */
const TELEGRAM_API_BASE = "https://api.telegram.org";
const SEND_TIMEOUT_MS = 5000;

export async function sendTelegramAlert(text: string): Promise<void> {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;

  if (!token || !chatId) {
    // eslint-disable-next-line no-console
    console.warn("[telegram] not configured — skipping alert:", text);
    return;
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text();
      // eslint-disable-next-line no-console
      console.error(`[telegram] send failed: ${res.status} ${body.slice(0, 200)}`);
    }
  } catch (err) {
    // Never let an alerting-channel failure break the caller — Sentry is
    // the primary channel; Telegram is a convenience second one.
    // eslint-disable-next-line no-console
    console.error("[telegram] send threw:", err instanceof Error ? err.message : String(err));
  }
}
