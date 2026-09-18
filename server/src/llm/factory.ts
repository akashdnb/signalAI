import type { LLMProvider } from "./provider.js";
import { createOpenAICompatibleProvider } from "./providers/openAICompatibleProvider.js";

/**
 * Config-driven provider selection (Tech Stack: "a config-driven `provider`
 * field + a slim internal provider interface — same pattern already
 * proven in the linkedin-job-search project"). Switching from Groq to
 * Together/DeepSeek/Gemini's compat layer is an env change: LLM_PROVIDER,
 * LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.
 */
export function createLLMProviderFromEnv(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const providerName = env.LLM_PROVIDER ?? "";
  const baseUrl = env.LLM_BASE_URL ?? "";
  const apiKey = env.LLM_API_KEY ?? "";
  const model = env.LLM_MODEL ?? "";

  if (!providerName || !baseUrl || !apiKey || !model) {
    throw new Error(
      "LLM provider not configured — set LLM_PROVIDER, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL",
    );
  }

  // Every provider on the shortlist (Groq, Together AI, DeepSeek, Gemini's
  // compat layer) speaks the OpenAI chat-completions shape, so one client
  // covers all of them today — a provider that doesn't would get its own
  // file here without touching this factory's callers.
  return createOpenAICompatibleProvider({ name: providerName, baseUrl, apiKey, model });
}
