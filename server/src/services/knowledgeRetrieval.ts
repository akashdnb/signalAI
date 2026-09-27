import type { Pool } from "pg";
import type { EmbeddingProvider } from "../llm/embeddingProvider.js";
import { queryRelevantChunks, type RetrievedChunk } from "../db/knowledgeBase.js";
import { config } from "../config.js";

export type { RetrievedChunk };

const MAX_CHUNKS = 5;

export interface RetrievalResult {
  /** False when the tenant has never uploaded a knowledge base document at all — distinct from "uploaded one, but this query doesn't match it well" (belowThreshold). A tenant with no knowledge base gets NO grounded-fallback behavior at all: RAG is simply inactive for them, and the caller proceeds exactly as Phase 1/2A/2B already did. Forcing a hard fallback on every reply for a tenant who never opted into a knowledge base would be a regression, not a safety improvement. */
  hasKnowledgeBase: boolean;
  chunks: RetrievedChunk[];
  /** Only meaningful when hasKnowledgeBase is true. */
  belowThreshold: boolean;
  /** The best (closest) chunk's cosine similarity, when hasKnowledgeBase is true — surfaced so a below-threshold fallback's actual number is visible (in fellBackReason, logs, and the preview UI) instead of just "it failed," which is what actually let RAG_MIN_SIMILARITY_THRESHOLD get tuned to a real value instead of staying a guess. */
  bestSimilarity?: number;
}

/**
 * Grounded-Answer-Only Fallback (roadmap Phase 2C): retrieves the
 * tenant's closest-matching knowledge base chunks for the incoming
 * message, if any knowledge base exists for them at all. `embeddingProvider`
 * is null when embeddings aren't configured on this server (config.ts
 * degrades gracefully, same as every other optional integration) — in
 * that case no tenant could ever have successfully uploaded a document
 * either, so this returns the same "no knowledge base" result a tenant
 * with zero uploads gets, with no special-casing needed.
 */
export async function retrieveContext(
  pool: Pool,
  embeddingProvider: EmbeddingProvider | null,
  tenantId: string,
  queryText: string,
): Promise<RetrievalResult> {
  if (!embeddingProvider) return { hasKnowledgeBase: false, chunks: [], belowThreshold: false };

  const { vectors } = await embeddingProvider.embed([queryText]);
  const queryEmbedding = vectors[0];
  if (!queryEmbedding) return { hasKnowledgeBase: false, chunks: [], belowThreshold: false };

  const chunks = await queryRelevantChunks(pool, tenantId, queryEmbedding, MAX_CHUNKS);
  // queryRelevantChunks returns the closest N chunks regardless of how
  // dissimilar they are — it only returns zero rows when the tenant has
  // literally no ready chunks at all, which is exactly the "no knowledge
  // base" signal this function needs, with no separate existence check.
  if (chunks.length === 0) return { hasKnowledgeBase: false, chunks: [], belowThreshold: false };

  const bestSimilarity = chunks[0]!.similarity; // queryRelevantChunks orders closest-first
  return {
    hasKnowledgeBase: true,
    chunks,
    belowThreshold: bestSimilarity < config.ragMinSimilarityThreshold,
    bestSimilarity,
  };
}

/** Formats retrieved chunks as the "Reference material" block woven into a system prompt — shared by replyEngine.ts and milestoneEngine.ts so both engines cite the same tenant knowledge the same way. */
export function formatReferenceMaterial(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const items = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n");
  return [
    `Reference material from this business's own knowledge base (use it to ground your answer — do not contradict it, and do not invent facts not supported by it or by the conversation itself):`,
    items,
  ].join("\n");
}
