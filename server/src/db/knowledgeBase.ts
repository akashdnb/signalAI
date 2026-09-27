import type { Pool } from "pg";
import type { Queryable } from "./types.js";

export type KnowledgeBaseDocumentStatus = "processing" | "ready" | "failed";

export interface KnowledgeBaseDocument {
  id: string;
  tenantId: string;
  filename: string;
  contentType: string;
  storageKey: string;
  version: number;
  status: KnowledgeBaseDocumentStatus;
  errorReason: string | null;
  supersededAt: Date | null;
  createdAt: Date;
}

interface KnowledgeBaseDocumentRow {
  id: string;
  tenant_id: string;
  filename: string;
  content_type: string;
  storage_key: string;
  version: number;
  status: KnowledgeBaseDocumentStatus;
  error_reason: string | null;
  superseded_at: Date | null;
  created_at: Date;
}

function toDocument(row: KnowledgeBaseDocumentRow): KnowledgeBaseDocument {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    filename: row.filename,
    contentType: row.content_type,
    storageKey: row.storage_key,
    version: row.version,
    status: row.status,
    errorReason: row.error_reason,
    supersededAt: row.superseded_at,
    createdAt: row.created_at,
  };
}

/**
 * pgvector accepts a bracketed literal ("[0.1,0.2,...]") cast to `vector`.
 * node-pg has no native vector type support, so every embedding column
 * read/write in this module goes through this string form.
 */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * "Versioned, re-embeddable on update" (roadmap Phase 2C Knowledge Base):
 * the document's identity across versions is (tenant_id, filename) —
 * re-uploading a file with the same name creates a new version rather
 * than mutating the old one in place, so a re-upload in progress never
 * serves half-updated content to retrieval (the old version stays
 * `ready` until the new one is). Version numbering and the insert are
 * wrapped in one transaction so two concurrent uploads of the same
 * filename can't both compute the same "next version" number.
 */
export async function createProcessingDocument(
  pool: Pool,
  params: { tenantId: string; filename: string; contentType: string; storageKey: string },
): Promise<KnowledgeBaseDocument> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const versionResult = await client.query<{ next_version: string }>(
      `select coalesce(max(version), 0) + 1 as next_version
       from knowledge_base_documents
       where tenant_id = $1 and filename = $2`,
      [params.tenantId, params.filename],
    );
    const nextVersion = Number(versionResult.rows[0]!.next_version);

    const result = await client.query<KnowledgeBaseDocumentRow>(
      `insert into knowledge_base_documents (tenant_id, filename, content_type, storage_key, version, status)
       values ($1, $2, $3, $4, $5, 'processing')
       returning *`,
      [params.tenantId, params.filename, params.contentType, params.storageKey, nextVersion],
    );
    await client.query("COMMIT");
    return toDocument(result.rows[0]!);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Marks this version `ready` and supersedes any PRIOR ready version of the
 * same (tenant_id, filename) — retrieval only ever queries `ready and
 * superseded_at is null`, so this is the moment a re-upload actually takes
 * over from the version it replaces. Superseding doesn't delete the old
 * version's chunks; it just stops them from being queried.
 */
export async function markDocumentReady(
  pool: Pool,
  params: { tenantId: string; documentId: string },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ filename: string }>(
      `update knowledge_base_documents set status = 'ready'
       where id = $1 and tenant_id = $2
       returning filename`,
      [params.documentId, params.tenantId],
    );
    const filename = result.rows[0]?.filename;
    if (filename) {
      await client.query(
        `update knowledge_base_documents
         set superseded_at = now()
         where tenant_id = $1 and filename = $2 and id != $3 and status = 'ready' and superseded_at is null`,
        [params.tenantId, filename, params.documentId],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fail-closed on any ingestion step's exception (parse/chunk/embed/store):
 * this version is marked `failed` and never becomes queryable — the
 * tenant's prior `ready` version (if any) is untouched and keeps serving
 * retrieval, matching this codebase's established fail-closed shape
 * elsewhere (replyEngine.ts/milestoneEngine.ts fall back to rule-based
 * rather than a half-generated reply).
 */
export async function markDocumentFailed(
  pool: Queryable,
  params: { tenantId: string; documentId: string; errorReason: string },
): Promise<void> {
  await pool.query(
    `update knowledge_base_documents set status = 'failed', error_reason = $3
     where id = $1 and tenant_id = $2`,
    [params.documentId, params.tenantId, params.errorReason],
  );
}

export async function listDocumentsForTenant(pool: Queryable, tenantId: string): Promise<KnowledgeBaseDocument[]> {
  const result = await pool.query<KnowledgeBaseDocumentRow>(
    `select * from knowledge_base_documents where tenant_id = $1 order by filename, version desc`,
    [tenantId],
  );
  return result.rows.map(toDocument);
}

export async function getDocument(
  pool: Queryable,
  tenantId: string,
  documentId: string,
): Promise<KnowledgeBaseDocument | null> {
  const result = await pool.query<KnowledgeBaseDocumentRow>(
    `select * from knowledge_base_documents where id = $1 and tenant_id = $2`,
    [documentId, tenantId],
  );
  return result.rows[0] ? toDocument(result.rows[0]) : null;
}

/** Returns the deleted document (so the caller can also remove its S3 object), or null if it didn't exist for this tenant. Chunks cascade via the explicit delete below, since the FK has no ON DELETE CASCADE (matching this schema's general preference for explicit, auditable deletes over implicit cascades). */
export async function deleteDocument(pool: Pool, tenantId: string, documentId: string): Promise<KnowledgeBaseDocument | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Chunks first — the FK from knowledge_base_chunks to
    // knowledge_base_documents has no ON DELETE CASCADE (explicit,
    // auditable deletes over implicit ones, matching this schema's general
    // preference), so deleting the parent row first violates it.
    await client.query(`delete from knowledge_base_chunks where document_id = $1`, [documentId]);
    const result = await client.query<KnowledgeBaseDocumentRow>(
      `delete from knowledge_base_documents where id = $1 and tenant_id = $2 returning *`,
      [documentId, tenantId],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("COMMIT");
    return toDocument(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface KnowledgeBaseChunkInput {
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export async function insertChunks(
  pool: Queryable,
  params: { tenantId: string; documentId: string; chunks: KnowledgeBaseChunkInput[] },
): Promise<void> {
  if (params.chunks.length === 0) return;

  const values: string[] = [];
  const args: unknown[] = [];
  params.chunks.forEach((chunk, i) => {
    const base = i * 5;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::vector)`);
    args.push(params.documentId, params.tenantId, chunk.chunkIndex, chunk.content, toVectorLiteral(chunk.embedding));
  });

  await pool.query(
    `insert into knowledge_base_chunks (document_id, tenant_id, chunk_index, content, embedding)
     values ${values.join(", ")}`,
    args,
  );
}

export interface RetrievedChunk {
  content: string;
  documentId: string;
  /** Cosine similarity (1 - cosine distance): 1.0 is identical direction, 0 is orthogonal, negative is opposite. */
  similarity: number;
}

/**
 * Tenant-Isolated Retrieval (roadmap Phase 2C): filtered by `tenant_id` at
 * this query itself, not by a join or an application-layer check
 * afterward — "a leak here is a live AI reply exposing another client's
 * data, not just a dashboard bug." Only chunks belonging to a `ready`,
 * non-superseded document version are considered, so an in-progress
 * re-upload's old version keeps serving retrieval until the new one is
 * actually ready.
 *
 * No ANN index (ivfflat/hnsw) yet — deferred until row counts at pilot
 * scale justify one; a sequential `<=>` scan filtered by tenant_id is
 * correct and fast enough for now.
 */
export async function queryRelevantChunks(
  pool: Queryable,
  tenantId: string,
  queryEmbedding: number[],
  limit = 5,
): Promise<RetrievedChunk[]> {
  const result = await pool.query<{ content: string; document_id: string; similarity: number }>(
    `select c.content, c.document_id, 1 - (c.embedding <=> $2::vector) as similarity
     from knowledge_base_chunks c
     join knowledge_base_documents d on d.id = c.document_id
     where c.tenant_id = $1 and d.status = 'ready' and d.superseded_at is null
     order by c.embedding <=> $2::vector
     limit $3`,
    [tenantId, toVectorLiteral(queryEmbedding), limit],
  );
  return result.rows.map((row) => ({
    content: row.content,
    documentId: row.document_id,
    similarity: Number(row.similarity),
  }));
}
