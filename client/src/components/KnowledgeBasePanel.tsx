import { useEffect, useRef, useState } from "react";
import { api, type KnowledgeBaseDocument } from "../api";

const STATUS_LABEL: Record<KnowledgeBaseDocument["status"], string> = {
  processing: "Processing…",
  ready: "Ready",
  failed: "Failed",
};

function statusPillClass(status: KnowledgeBaseDocument["status"]): string {
  if (status === "ready") return "pill pill-ok";
  if (status === "failed") return "pill pill-error";
  return "pill";
}

/**
 * Phase 2C Per-Tenant Knowledge Base: upload a PDF/text/markdown document
 * (FAQ, pricing sheet, product catalog) that the RAG engine grounds
 * replies in. Re-uploading a file with the same name supersedes the prior
 * version — see server/src/db/knowledgeBase.ts.
 */
export function KnowledgeBasePanel({ tenantId }: { tenantId: string }) {
  const [documents, setDocuments] = useState<KnowledgeBaseDocument[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadDocuments() {
    return api
      .listKnowledgeBaseDocuments(tenantId)
      .then(setDocuments)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load knowledge base"));
  }

  useEffect(() => {
    let cancelled = false;
    api
      .listKnowledgeBaseDocuments(tenantId)
      .then((docs) => {
        if (!cancelled) setDocuments(docs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load knowledge base");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadKnowledgeBaseDocument(tenantId, file);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(documentId: string) {
    setError(null);
    try {
      await api.deleteKnowledgeBaseDocument(tenantId, documentId);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    }
  }

  return (
    <section className="card">
      <h2>Knowledge Base</h2>
      <p className="muted small">
        Upload your FAQ, pricing sheet, or product catalog (PDF, plain text, or Markdown) — AI replies are grounded
        in this content, and questions it can't answer confidently are handed to a human instead of guessed at.
      </p>
      {error && <div className="banner banner-error">{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        onChange={handleFileSelected}
        disabled={uploading}
      />
      {uploading && <p className="muted small">Uploading…</p>}

      {documents === null ? (
        <p className="muted">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="muted">No documents uploaded yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>File</th>
              <th>Version</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.filename}</td>
                <td>{doc.version}</td>
                <td>
                  <span className={statusPillClass(doc.status)}>{STATUS_LABEL[doc.status]}</span>
                  {doc.status === "failed" && doc.errorReason && (
                    <div className="muted small">{doc.errorReason}</div>
                  )}
                </td>
                <td>
                  <button className="btn-secondary btn-small" onClick={() => handleDelete(doc.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
