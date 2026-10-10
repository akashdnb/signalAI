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

const PAGE_SIZE = 20;

export function KnowledgeBasePanel({ tenantId }: { tenantId: string }) {
  const [pageData, setPageData] = useState<PaginatedResponse<KnowledgeBaseDocument> | null>(null);
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
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
    setError(null);
    try {
      await api.deleteKnowledgeBaseDocument(tenantId, documentId);
      setReloadToken((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    }
  }

  const documents = pageData?.items ?? null;

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
        <p className="muted" role="status">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="muted">No documents uploaded yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table min-w-[620px]">
              <thead><tr><th>File</th><th>Version</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.filename}</td>
                    <td>{doc.version}</td>
                    <td>
                      <span className={statusPillClass(doc.status)}>{STATUS_LABEL[doc.status]}</span>
                      {doc.status === "failed" && doc.errorReason && <div className="muted small">{doc.errorReason}</div>}
                    </td>
                    <td><button className="btn-secondary btn-small" onClick={() => void handleDelete(doc.id)}>Delete</button></td>
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
