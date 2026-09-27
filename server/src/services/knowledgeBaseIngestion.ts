import crypto from "node:crypto";
import type { Pool } from "pg";
import { extractText } from "unpdf";
import type { EmbeddingProvider } from "../llm/embeddingProvider.js";
import { chunkText } from "../lib/chunking.js";
import { uploadObject, isObjectStorageConfigured } from "../lib/objectStorage.js";
import {
  createProcessingDocument,
  insertChunks,
  markDocumentFailed,
  markDocumentReady,
  type KnowledgeBaseDocument,
} from "../db/knowledgeBase.js";

const SUPPORTED_CONTENT_TYPES = new Set(["application/pdf", "text/plain", "text/markdown"]);

export function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPES.has(contentType);
}

async function parseToText(buffer: Buffer, contentType: string): Promise<string> {
  if (contentType === "application/pdf") {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  // text/plain, text/markdown — passthrough, no parsing needed.
  return buffer.toString("utf-8");
}

export interface IngestDocumentParams {
  tenantId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}

/**
 * Phase 2C Knowledge Base upload pipeline: parse -> chunk -> embed ->
 * upload the original file to object storage -> write document + chunk
 * rows. Fails closed on any step's exception (unparseable PDF, an
 * embeddings-API error, an object-storage failure): the new version is
 * marked 'failed' with the reason and never becomes queryable — the
 * tenant's prior 'ready' version, if any, is untouched and keeps serving
 * retrieval the whole time (see db/knowledgeBase.ts's markDocumentReady),
 * matching this codebase's established fail-closed shape elsewhere
 * (replyEngine.ts/milestoneEngine.ts degrade to rule-based rather than a
 * half-generated reply).
 */
export async function ingestKnowledgeBaseDocument(
  pool: Pool,
  embeddingProvider: EmbeddingProvider,
  params: IngestDocumentParams,
): Promise<KnowledgeBaseDocument> {
  if (!isSupportedContentType(params.contentType)) {
    throw new Error(`unsupported content type: ${params.contentType} (supported: ${[...SUPPORTED_CONTENT_TYPES].join(", ")})`);
  }
  if (!isObjectStorageConfigured()) {
    throw new Error("object storage is not configured on this server (KB_S3_BUCKET unset)");
  }

  const storageKey = `tenants/${params.tenantId}/kb/${crypto.randomUUID()}`;
  const document = await createProcessingDocument(pool, {
    tenantId: params.tenantId,
    filename: params.filename,
    contentType: params.contentType,
    storageKey,
  });

  try {
    const text = await parseToText(params.buffer, params.contentType);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("document contains no extractable text");
    }

    const { vectors } = await embeddingProvider.embed(chunks);

    // Upload the original AFTER parsing/embedding succeed — no point
    // paying for object storage on a document that's about to be marked
    // failed anyway.
    await uploadObject(storageKey, params.buffer, params.contentType);

    await insertChunks(pool, {
      tenantId: params.tenantId,
      documentId: document.id,
      chunks: chunks.map((content, i) => ({ chunkIndex: i, content, embedding: vectors[i]! })),
    });

    await markDocumentReady(pool, { tenantId: params.tenantId, documentId: document.id });
    return { ...document, status: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markDocumentFailed(pool, { tenantId: params.tenantId, documentId: document.id, errorReason: message });
    return { ...document, status: "failed", errorReason: message };
  }
}
