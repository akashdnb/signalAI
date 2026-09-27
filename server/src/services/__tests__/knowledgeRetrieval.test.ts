import { describe, expect, it, vi } from "vitest";
import { retrieveContext, formatReferenceMaterial } from "../knowledgeRetrieval.js";
import type { EmbeddingProvider } from "../../llm/embeddingProvider.js";

function fakePool(rows: Array<{ content: string; document_id: string; similarity: number }>) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as import("pg").Pool;
}

function fakeEmbeddingProvider(vector: number[] | null): EmbeddingProvider {
  return {
    name: "fake",
    embed: vi.fn().mockResolvedValue({ vectors: vector ? [vector] : [] }),
  };
}

describe("retrieveContext", () => {
  it("returns hasKnowledgeBase: false with no DB call when no embedding provider is configured", async () => {
    const pool = fakePool([]);
    const result = await retrieveContext(pool, null, "tenant-1", "hello");
    expect(result).toEqual({ hasKnowledgeBase: false, chunks: [], belowThreshold: false });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns hasKnowledgeBase: false when the tenant has no chunks at all", async () => {
    const pool = fakePool([]);
    const provider = fakeEmbeddingProvider([1, 0]);
    const result = await retrieveContext(pool, provider, "tenant-1", "hello");
    expect(result).toEqual({ hasKnowledgeBase: false, chunks: [], belowThreshold: false });
  });

  it("returns hasKnowledgeBase: true and belowThreshold: false when the best match is a strong one", async () => {
    const pool = fakePool([{ content: "our pricing is $10/mo", document_id: "doc-1", similarity: 0.95 }]);
    const provider = fakeEmbeddingProvider([1, 0]);
    const result = await retrieveContext(pool, provider, "tenant-1", "how much does it cost?");
    expect(result.hasKnowledgeBase).toBe(true);
    expect(result.belowThreshold).toBe(false);
    expect(result.chunks).toHaveLength(1);
  });

  it("returns belowThreshold: true when the tenant has a knowledge base but nothing matches well", async () => {
    const pool = fakePool([{ content: "unrelated content", document_id: "doc-1", similarity: 0.1 }]);
    const provider = fakeEmbeddingProvider([1, 0]);
    const result = await retrieveContext(pool, provider, "tenant-1", "some off-topic question");
    expect(result.hasKnowledgeBase).toBe(true);
    expect(result.belowThreshold).toBe(true);
  });
});

describe("formatReferenceMaterial", () => {
  it("returns an empty string for no chunks", () => {
    expect(formatReferenceMaterial([])).toBe("");
  });

  it("numbers each chunk and includes a grounding instruction", () => {
    const text = formatReferenceMaterial([
      { content: "chunk one", documentId: "d1", similarity: 0.9 },
      { content: "chunk two", documentId: "d1", similarity: 0.8 },
    ]);
    expect(text).toContain("[1] chunk one");
    expect(text).toContain("[2] chunk two");
    expect(text).toMatch(/knowledge base/);
  });
});
