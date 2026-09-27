import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleEmbeddingProvider } from "../embeddingProvider.js";

describe("openAICompatibleEmbeddingProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts texts as input and returns vectors in order", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [0.1, 0.2] },
          { index: 1, embedding: [0.3, 0.4] },
        ],
      }),
    });

    const provider = createOpenAICompatibleEmbeddingProvider({
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "key-123",
      model: "text-embedding-004",
    });

    const result = await provider.embed(["chunk one", "chunk two"]);

    expect(result.vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/embeddings");
    expect(options.headers.Authorization).toBe("Bearer key-123");
    const body = JSON.parse(options.body);
    expect(body).toEqual({ model: "text-embedding-004", input: ["chunk one", "chunk two"] });
  });

  it("re-sorts by the response's own index rather than trusting array order", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: [0.3, 0.4] },
          { index: 0, embedding: [0.1, 0.2] },
        ],
      }),
    });

    const provider = createOpenAICompatibleEmbeddingProvider({
      name: "gemini",
      baseUrl: "https://example.com/v1",
      apiKey: "key",
      model: "text-embedding-004",
    });

    const result = await provider.embed(["first", "second"]);
    expect(result.vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("returns an empty vectors array without calling fetch for an empty input", async () => {
    const provider = createOpenAICompatibleEmbeddingProvider({
      name: "gemini",
      baseUrl: "https://example.com/v1",
      apiKey: "key",
      model: "text-embedding-004",
    });

    const result = await provider.embed([]);
    expect(result.vectors).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws with the response body when the API call fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const provider = createOpenAICompatibleEmbeddingProvider({
      name: "gemini",
      baseUrl: "https://example.com/v1",
      apiKey: "key",
      model: "text-embedding-004",
    });

    await expect(provider.embed(["a"])).rejects.toThrow(/rate limited/);
  });

  it("throws when the response returns the wrong number of embeddings", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ index: 0, embedding: [0.1] }] }),
    });

    const provider = createOpenAICompatibleEmbeddingProvider({
      name: "gemini",
      baseUrl: "https://example.com/v1",
      apiKey: "key",
      model: "text-embedding-004",
    });

    await expect(provider.embed(["a", "b"])).rejects.toThrow(/returned 1 embedding\(s\) for 2 input\(s\)/);
  });
});
