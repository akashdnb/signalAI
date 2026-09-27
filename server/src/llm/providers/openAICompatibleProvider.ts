import type { GenerateReplyInput, LLMProvider } from "../provider.js";

/**
 * Works against any OpenAI-compatible chat-completions endpoint — Groq,
 * Together AI, DeepSeek, or Gemini's compatibility layer (see Tech Stack:
 * "pick a hosted provider with published rate limits and a production
 * track record"). Switching providers is a base URL + API key + model
 * change, not a rewrite, per the swappable-provider design.
 */
export interface OpenAICompatibleConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Single-digit seconds for the comment tier (R2-02): a hung provider under key_strict_fifo freezes that lead's entire conversation for as long as the socket stays open, since only one job per lead can be active at a time. */
  timeoutMs?: number;
  /** R2-03: caps a runaway (and fully billed) generation that the comment-tier length check would reject anyway. */
  maxTokens?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_TOKENS = 500;
const MAX_ERROR_BODY_CHARS = 200;

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): LLMProvider {
  return {
    name: config.name,
    async generateReply({ systemPrompt, userMessage, responseFormat }: GenerateReplyInput) {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          // R3-07: native JSON mode, when the caller asks for it, instead
          // of relying entirely on prose-plus-regex recovery.
          ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
        }),
        signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      if (!res.ok) {
        // R2-04: the raw body can echo request context back (some APIs
        // include it in error detail) and this string is destined for
        // fellBackReason — logs and possibly a lead's audit trail. Truncate
        // here; a caller wanting the full body should read it from the
        // error tracker, not from this message.
        const bodyText = await res.text();
        const truncated =
          bodyText.length > MAX_ERROR_BODY_CHARS ? `${bodyText.slice(0, MAX_ERROR_BODY_CHARS)}…` : bodyText;
        throw new Error(`${config.name} generateReply failed: ${res.status} ${truncated}`);
      }

      const body = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        // Every OpenAI-compatible chat-completions endpoint returns this,
        // but it's still optional here — a provider that omits or
        // malforms it must degrade to "no usage recorded", not throw.
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = body.choices[0]?.message.content;
      if (!content) {
        throw new Error(`${config.name} returned no completion content`);
      }
      const usage =
        typeof body.usage?.prompt_tokens === "number" && typeof body.usage?.completion_tokens === "number"
          ? { promptTokens: body.usage.prompt_tokens, completionTokens: body.usage.completion_tokens }
          : undefined;
      return { text: content, usage };
    },
  };
}
