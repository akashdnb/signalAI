import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLLMProviderFromEnv } from "../factory.js";

describe("createLLMProviderFromEnv", () => {
  it("throws a clear error when the provider isn't configured, rather than constructing a broken client", () => {
    expect(() => createLLMProviderFromEnv({})).toThrow(/LLM provider not configured/);
  });

  it("builds a named provider from a complete config", () => {
    const provider = createLLMProviderFromEnv({
      LLM_PROVIDER: "groq",
      LLM_BASE_URL: "https://api.groq.com/openai/v1",
      LLM_API_KEY: "key",
      LLM_MODEL: "llama-3.1",
    } as NodeJS.ProcessEnv);

    expect(provider.name).toBe("groq");
  });

  // Confirmed live: a reasoning model (gpt-oss:20b on Ollama Cloud) needs
  // both raised beyond the hardcoded 8s/500-token defaults — its internal
  // "thinking" tokens consume max_tokens before any user-facing content is
  // emitted, and it's inherently slower per response.
  describe("LLM_TIMEOUT_MS / LLM_MAX_TOKENS (reasoning-model support)", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) });
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("passes LLM_MAX_TOKENS through to the provider's request body when set", async () => {
      const provider = createLLMProviderFromEnv({
        LLM_PROVIDER: "ollama_cloud",
        LLM_BASE_URL: "https://ollama.com/v1",
        LLM_API_KEY: "key",
        LLM_MODEL: "gpt-oss:20b",
        LLM_MAX_TOKENS: "4000",
      } as NodeJS.ProcessEnv);

      await provider.generateReply({ systemPrompt: "s", userMessage: "u" });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(JSON.parse(options.body).max_tokens).toBe(4000);
    });

    it("keeps the provider's own default max_tokens when LLM_MAX_TOKENS is unset", async () => {
      const provider = createLLMProviderFromEnv({
        LLM_PROVIDER: "groq",
        LLM_BASE_URL: "https://api.groq.com/openai/v1",
        LLM_API_KEY: "key",
        LLM_MODEL: "llama-3.1",
      } as NodeJS.ProcessEnv);

      await provider.generateReply({ systemPrompt: "s", userMessage: "u" });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(JSON.parse(options.body).max_tokens).toBe(500); // unchanged default
    });
  });
});
