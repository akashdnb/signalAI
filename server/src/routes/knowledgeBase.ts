import { Router } from "express";
import multer from "multer";
import { getPool } from "../db/pool.js";
import {
  deleteDocument,
  getDocument,
  listDocumentsForTenant,
  queryRelevantChunks,
} from "../db/knowledgeBase.js";
import { deleteObject, getObject, isObjectStorageConfigured } from "../lib/objectStorage.js";
import { ingestKnowledgeBaseDocument, isSupportedContentType } from "../services/knowledgeBaseIngestion.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import type { EmbeddingProvider } from "../llm/embeddingProvider.js";
import { Sentry } from "../lib/sentry.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_QUERY_LENGTH = 1000;
const MAX_RETRIEVAL_RESULTS = 10;
const MAX_PREVIEW_CHARACTERS = 100_000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

/**
 * Tenant-scoped Knowledge Base operations. Optional integrations surface
 * explicit unavailable responses; retrieval always uses the existing,
 * tenant-filtered pgvector source of truth.
 */
export function knowledgeBaseRouter(embeddingProvider: EmbeddingProvider | null) {
  const router = Router();
  router.use("/tenants/:tenantId", requireTenantSession);

  router.get("/tenants/:tenantId/knowledge-base", async (req, res) => {
    const documents = await listDocumentsForTenant(getPool(), req.params.tenantId!);
    return res.status(200).json({ documents: documents.map(({ storageKey: _storageKey, ...document }) => document) });
  });

  router.get("/tenants/:tenantId/knowledge-base/:documentId", async (req, res) => {
    const document = await getDocument(getPool(), req.params.tenantId!, req.params.documentId!);
    if (!document) return res.status(404).json({ error: "document not found" });
    const { storageKey: _storageKey, ...safeDocument } = document;
    return res.status(200).json({ document: safeDocument });
  });

  // Text preview is assembled only from indexed chunks in the current ready
  // version; no public/object-storage URL is generated for private sources.
  router.get("/tenants/:tenantId/knowledge-base/:documentId/preview", async (req, res) => {
    const pool = getPool();
    const document = await getDocument(pool, req.params.tenantId!, req.params.documentId!);
    if (!document) return res.status(404).json({ error: "document not found" });
    if (document.status !== "ready" || document.supersededAt) {
      return res.status(409).json({ error: "document is not available for preview", status: document.status });
    }

    const result = await pool.query<{ content: string; chunk_index: number }>(
      `select content, chunk_index
         from knowledge_base_chunks
        where tenant_id = $1 and document_id = $2
        order by chunk_index asc`,
      [req.params.tenantId, req.params.documentId],
    );
    const fullContent = result.rows.map((row) => row.content).join("\n\n");
    return res.status(200).json({
      documentId: document.id,
      filename: document.filename,
      content: fullContent.slice(0, MAX_PREVIEW_CHARACTERS),
      truncated: fullContent.length > MAX_PREVIEW_CHARACTERS,
      chunkCount: result.rows.length,
    });
  });

  // Diagnostic retrieval probe backed by the same embedding/vector path as
  // live replies. Never returns other tenants' chunks or fabricated matches.
  router.post("/tenants/:tenantId/knowledge-base/retrieval", async (req, res) => {
    const query = req.body?.query;
    const rawLimit = req.body?.limit;
    if (typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query is required" });
    }
    if (query.trim().length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ error: `query must be at most ${MAX_QUERY_LENGTH} characters` });
    }
    if (rawLimit !== undefined && (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_RETRIEVAL_RESULTS)) {
      return res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_RETRIEVAL_RESULTS}` });
    }
    if (!embeddingProvider) {
      return res.status(503).json({ error: "knowledge retrieval is not configured on this server" });
    }

    try {
      const embedded = await embeddingProvider.embed([query.trim()]);
      const vector = embedded.vectors[0];
      if (!vector || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) {
        console.error("Knowledge retrieval embedding returned an invalid vector");
        return res.status(502).json({ error: "knowledge retrieval is temporarily unavailable" });
      }
      const chunks = await queryRelevantChunks(getPool(), req.params.tenantId!, vector, rawLimit ?? 5);
      return res.status(200).json({
        query: query.trim(),
        results: chunks.map(({ content, documentId, similarity }) => ({ content, documentId, similarity })),
        count: chunks.length,
      });
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  });

  // Raw source downloads are authenticated and resolved from the stored key,
  // never from caller-supplied paths. Text preview remains the primary UI path.
  router.get("/tenants/:tenantId/knowledge-base/:documentId/source", async (req, res) => {
    const document = await getDocument(getPool(), req.params.tenantId!, req.params.documentId!);
    if (!document) return res.status(404).json({ error: "document not found" });
    if (document.status !== "ready" || document.supersededAt) {
      return res.status(409).json({ error: "document source is not available", status: document.status });
    }
    if (!isObjectStorageConfigured()) {
      return res.status(503).json({ error: "knowledge source storage is not configured on this server" });
    }
    try {
      const body = await getObject(document.storageKey);
      res.setHeader("Content-Type", document.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${document.filename.replace(/["\\\\\r\n]/g, "_")}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).send(body);
    } catch (err) {
      Sentry.captureException(err);
      return res.status(502).json({ error: "knowledge source file is temporarily unavailable" });
    }
  });

  router.post(
    "/tenants/:tenantId/knowledge-base",
    (req, res, next) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err && typeof err === "object" && "code" in err && err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "file is too large; the maximum upload size is 10 MB" });
        }
        if (err) return next(err);
        return next();
      });
    },
    async (req, res) => {
      if (!embeddingProvider) {
        return res.status(503).json({ error: "the knowledge base is not configured on this server" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "no file uploaded — expected multipart field 'file'" });
      }
      if (!isSupportedContentType(req.file.mimetype)) {
        return res.status(400).json({
          error: `unsupported file type: ${req.file.mimetype} — supported: application/pdf, text/plain, text/markdown`,
        });
      }

      try {
        const document = await ingestKnowledgeBaseDocument(getPool(), embeddingProvider, {
          tenantId: req.params.tenantId!,
          filename: req.file.originalname,
          contentType: req.file.mimetype,
          buffer: req.file.buffer,
        });
        const { storageKey: _storageKey, ...safeDocument } = document;
        return res.status(201).json({ document: safeDocument });
      } catch (err) {
        console.error("Knowledge base ingestion failed to start:", err);
        Sentry.captureException(err);
        return res.status(502).json({ error: "failed to ingest the uploaded document" });
      }
    },
  );

  router.delete("/tenants/:tenantId/knowledge-base/:documentId", async (req, res) => {
    const deleted = await deleteDocument(getPool(), req.params.tenantId!, req.params.documentId!);
    if (!deleted) return res.status(404).json({ error: "document not found" });
    try {
      await deleteObject(deleted.storageKey);
    } catch (err) {
      console.warn("Failed to delete knowledge base object from storage (orphaned, non-fatal):", err);
      Sentry.captureException(err);
    }
    return res.sendStatus(204);
  });

  return router;
}
