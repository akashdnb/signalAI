import { useEffect, useRef, useState } from "react";
import { api, type KnowledgeBaseDocument } from "../api";
import { getKnowledgeBaseDocumentsPage, type PaginatedResponse } from "../api/pagination";
import { Pagination } from "./Pagination";

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const PAGE_SIZE = 20;

export function KnowledgeBasePanel({ tenantId }: { tenantId: string }) {
  const [pageData, setPageData] = useState<PaginatedResponse<KnowledgeBaseDocument> | null>(null);
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getKnowledgeBaseDocumentsPage(tenantId, page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setPageData(result);
        if (result.page !== page) setPage(result.page);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load knowledge base");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, page, reloadToken]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadKnowledgeBaseDocument(tenantId, file);
      setPage(1);
      setReloadToken((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(documentId: string) {
    if (!window.confirm("Delete this knowledge source? Automations that rely on it may no longer be able to ground replies from this document.")) return;
    setDeletingId(documentId);
    setError(null);
    try {
      await api.deleteKnowledgeBaseDocument(tenantId, documentId);
      setReloadToken((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  }

  const documents = pageData?.items ?? null;

  return (
    <section className="card">
      <h2>Knowledge Base</h2>
      <p className="muted small">
        Upload your FAQ, pricing sheet, or product catalog (PDF, plain text, or Markdown). AI replies use ready sources
        as grounding, and low-confidence questions are handed to a human instead of guessed at.
      </p>
      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <div className="rounded-xl border border-subtle bg-chip p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong>Upload a source</strong>
            <p className="muted small mt-1 mb-0">PDF, TXT, or Markdown. Processing happens after upload; only Ready sources are used for grounded replies.</p>
          </div>
          <button type="button" className="btn-primary btn-small" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Choose file"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          onChange={handleFileSelected}
          disabled={uploading}
        />
      </div>

      {documents === null ? (
        <p className="muted" role="status">Loading…</p>
      ) : documents.length === 0 ? (
        <div className="banner mt-4">
          <strong>No knowledge sources yet.</strong>
          <p className="small mt-1 mb-0">Upload your FAQ, pricing, or product information so AI replies can use your own content instead of relying only on the conversation.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto mt-4">
            <table className="table min-w-[760px]">
              <thead><tr><th>Source</th><th>Version</th><th>Status</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <strong>{doc.filename}</strong>
                      <div className="muted small">{doc.contentType}</div>
                    </td>
                    <td>{doc.version}</td>
                    <td>
                      <span className={statusPillClass(doc.status)}>{STATUS_LABEL[doc.status]}</span>
                      {doc.status === "processing" && <div className="muted small">Preparing this source for retrieval.</div>}
                      {doc.status === "ready" && <div className="muted small">Available for grounded replies.</div>}
                      {doc.status === "failed" && doc.errorReason && <div className="muted small">{doc.errorReason}</div>}
                    </td>
                    <td className="whitespace-nowrap" title={formatDate(doc.createdAt)}>{formatDate(doc.createdAt)}</td>
                    <td>
                      <button className="btn-secondary btn-small" onClick={() => void handleDelete(doc.id)} disabled={deletingId === doc.id}>
                        {deletingId === doc.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageData && <Pagination page={pageData.page} totalPages={pageData.totalPages} total={pageData.total} pageSize={pageData.pageSize} onPageChange={setPage} label="documents" />}
        </>
      )}
    </section>
  );
}
