import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendTelegramAlert } from "../telegram.js";

describe("sendTelegramAlert", () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    process.env.TELEGRAM_CHAT_ID = originalChatId;
  });

  it("is a safe no-op when unconfigured", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    await expect(sendTelegramAlert("test alert")).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts to the Telegram Bot API when configured", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await sendTelegramAlert("new lead!");

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");
    expect(JSON.parse(options.body)).toEqual({ chat_id: "12345", text: "new lead!" });
  });

  it("never throws when the API responds with an error", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" });

    await expect(sendTelegramAlert("test")).resolves.toBeUndefined();
  });

  it("never throws when the fetch itself rejects (network error)", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    await expect(sendTelegramAlert("test")).resolves.toBeUndefined();
  });
});
