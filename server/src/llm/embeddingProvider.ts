/**
 * Phase 2C Knowledge Base: a separate provider abstraction from
 * LLMProvider (provider.ts) — embeddings and chat completions are two
 * independent API capabilities, and not every OpenAI-compatible chat host
 * (Groq, DeepSeek) also serves embeddings. This works against any
 * OpenAI-compatible /embeddings endpoint (OpenAI itself, Gemini's
 * compatibility layer, etc.), same swappable-provider shape as
 * openAICompatibleProvider.ts.
 */
export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<{ vectors: number[][] }>;
}

export interface OpenAICompatibleEmbeddingConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_ERROR_BODY_CHARS = 200;

export function createOpenAICompatibleEmbeddingProvider(config: OpenAICompatibleEmbeddingConfig): EmbeddingProvider {
  return {
    name: config.name,
    async embed(texts: string[]) {
      if (texts.length === 0) return { vectors: [] };

      const res = await fetch(`${config.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ model: config.model, input: texts }),
        signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      if (!res.ok) {
        const bodyText = await res.text();
        const truncated =
          bodyText.length > MAX_ERROR_BODY_CHARS ? `${bodyText.slice(0, MAX_ERROR_BODY_CHARS)}…` : bodyText;
        throw new Error(`${config.name} embed failed: ${res.status} ${truncated}`);
      }

      const body = (await res.json()) as {
        data: Array<{ index: number; embedding: number[] }>;
      };
      if (!Array.isArray(body.data) || body.data.length !== texts.length) {
        throw new Error(`${config.name} returned ${body.data?.length ?? 0} embedding(s) for ${texts.length} input(s)`);
      }

      // The API's own contract is that `data` is returned in the same
      // order as `input`, but each item also carries its own `index` —
      // sort by it explicitly rather than trusting response order, since
      // an out-of-order response would otherwise silently pair a chunk's
      // text with a DIFFERENT chunk's vector.
      const vectors = [...body.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
      return { vectors };
    },
  };
}
