import { Router } from "express";
import multer from "multer";
import { getPool } from "../db/pool.js";
import { deleteDocument, listDocumentsForTenant } from "../db/knowledgeBase.js";
import { deleteObject } from "../lib/objectStorage.js";
import { ingestKnowledgeBaseDocument, isSupportedContentType } from "../services/knowledgeBaseIngestion.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import type { EmbeddingProvider } from "../llm/embeddingProvider.js";
import { Sentry } from "../lib/sentry.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — comfortably covers a pricing sheet/FAQ PDF at pilot scale
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

/**
 * Phase 2C Per-Tenant Knowledge Base upload/list/delete. `embeddingProvider`
 * is null when EMBEDDING_* isn't configured on this server — every route
 * below degrades to a clear 503 in that case, same shape as
 * isBillingConfigured() in routes/billing.ts, rather than crashing deep
 * inside the ingestion pipeline.
 */
export function knowledgeBaseRouter(embeddingProvider: EmbeddingProvider | null) {
  const router = Router();
  router.use("/tenants/:tenantId", requireTenantSession);

  router.get("/tenants/:tenantId/knowledge-base", async (req, res) => {
    const documents = await listDocumentsForTenant(getPool(), req.params.tenantId!);
    return res.status(200).json({ documents });
  });

  router.post("/tenants/:tenantId/knowledge-base", upload.single("file"), async (req, res) => {
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
      return res.status(201).json({ document });
    } catch (err) {
      // Every step ingestKnowledgeBaseDocument can throw inside its own
      // try/catch is already caught there and turned into a 'failed'
      // document row, returned normally (not thrown) — reaching here means
      // something failed BEFORE that (e.g. object storage/embeddings
      // unconfigured, an unsupported content type slipping past the check
      // above), a genuine 5xx, not a per-document failure state.
      // eslint-disable-next-line no-console
      console.error("Knowledge base ingestion failed to start:", err);
      Sentry.captureException(err);
      return res.status(502).json({ error: "failed to ingest the uploaded document" });
    }
  });

  router.delete("/tenants/:tenantId/knowledge-base/:documentId", async (req, res) => {
    const deleted = await deleteDocument(getPool(), req.params.tenantId!, req.params.documentId!);
    if (!deleted) {
      return res.status(404).json({ error: "document not found" });
    }
    // Best-effort: the DB row (the actual source of truth for what's in
    // the knowledge base and what retrieval can see) is already gone at
    // this point regardless of whether this succeeds — an orphaned S3
    // object is wasted storage, never a retrieval-visible inconsistency.
    try {
      await deleteObject(deleted.storageKey);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to delete knowledge base object from storage (orphaned, non-fatal):", err);
      Sentry.captureException(err);
    }
    return res.sendStatus(204);
  });

  return router;
}
