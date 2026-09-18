import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleProvider } from "../openAICompatibleProvider.js";

describe("openAICompatibleProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts systemPrompt and userMessage as separate chat messages", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "the reply" } }] }),
    });

    const provider = createOpenAICompatibleProvider({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "key-123",
      model: "llama-3.1",
    });

    const result = await provider.generateReply({ systemPrompt: "sys", userMessage: "user text" });

    expect(result).toBe("the reply");
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(options.headers.Authorization).toBe("Bearer key-123");
    const body = JSON.parse(options.body);
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "user text" },
    ]);
  });

  it("throws with the response body when the API call fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const provider = createOpenAICompatibleProvider({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "key",
      model: "llama-3.1",
    });

    await expect(provider.generateReply({ systemPrompt: "s", userMessage: "u" })).rejects.toThrow(
      /rate limited/,
    );
  });

  it("throws when the response has no completion content", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    const provider = createOpenAICompatibleProvider({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "key",
      model: "llama-3.1",
    });

    await expect(provider.generateReply({ systemPrompt: "s", userMessage: "u" })).rejects.toThrow(
      /no completion content/,
    );
  });
});
