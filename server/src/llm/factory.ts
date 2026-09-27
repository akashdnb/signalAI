import type { LLMProvider } from "./provider.js";
import { createOpenAICompatibleProvider } from "./providers/openAICompatibleProvider.js";
import { createOpenAICompatibleEmbeddingProvider, type EmbeddingProvider } from "./embeddingProvider.js";

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

/**
 * Phase 2C Knowledge Base: deliberately a SEPARATE config surface from the
 * chat provider above (EMBEDDING_* env vars, not LLM_*) — not every chat
 * host (Groq, DeepSeek) also serves embeddings, so this is never assumed
 * to be the same provider as generateReply's. Returns null rather than
 * throwing when unconfigured: every caller (knowledgeRetrieval.ts, the KB
 * upload route) already treats "no embedding provider" as a graceful
 * degradation — KB upload/retrieval simply doesn't work yet — not a boot
 * failure, matching Stripe/Telegram/Resend's own optional-config shape.
 */
export function createEmbeddingProviderFromEnv(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider | null {
  const baseUrl = env.EMBEDDING_BASE_URL ?? "";
  const apiKey = env.EMBEDDING_API_KEY ?? "";
  const model = env.EMBEDDING_MODEL ?? "";

  if (!baseUrl || !apiKey || !model) return null;

  return createOpenAICompatibleEmbeddingProvider({ name: "embedding", baseUrl, apiKey, model });
}
