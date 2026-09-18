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
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): LLMProvider {
  return {
    name: config.name,
    async generateReply({ systemPrompt, userMessage }: GenerateReplyInput): Promise<string> {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`${config.name} generateReply failed: ${res.status} ${await res.text()}`);
      }

      const body = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = body.choices[0]?.message.content;
      if (!content) {
        throw new Error(`${config.name} returned no completion content`);
      }
      return content;
    },
  };
}
