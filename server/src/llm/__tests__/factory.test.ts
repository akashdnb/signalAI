import { describe, expect, it } from "vitest";
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
});
