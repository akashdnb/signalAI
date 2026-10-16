import { useEffect, useRef, useState } from "react";
import { api, type KnowledgeBaseDocument, type KnowledgeBaseDocumentPreview, type KnowledgeRetrievalResponse } from "../api";
import { getKnowledgeBaseDocumentsPage, type PaginatedResponse } from "../api/pagination";
import { Button, Field, TextInput } from "./ui";
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
  const [preview, setPreview] = useState<KnowledgeBaseDocumentPreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [retrieval, setRetrieval] = useState<KnowledgeRetrievalResponse | null>(null);
  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [retrievalError, setRetrievalError] = useState<string | null>(null);
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
      if (preview?.documentId === documentId) setPreview(null);
      setReloadToken((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  }

  async function handlePreview(documentId: string) {
    setPreviewLoadingId(documentId);
    setError(null);
    try {
      const result = await api.previewKnowledgeBaseDocument(tenantId, documentId);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview this source");
      setPreview(null);
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function handleRetrievalCheck(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) {
      setRetrievalError("Enter a question to test against your ready sources.");
      setRetrieval(null);
      return;
    }
    setRetrievalLoading(true);
    setRetrievalError(null);
    setRetrieval(null);
    try {
      const result = await api.retrieveKnowledgeBase(tenantId, query.trim());
      setRetrieval(result);
    } catch (err) {
      setRetrievalError(err instanceof Error ? err.message : "Knowledge retrieval failed");
    } finally {
      setRetrievalLoading(false);
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
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
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

      <section className="mt-6 border-b border-line pb-5">
        <h3 className="text-base font-semibold text-ink">Test knowledge retrieval</h3>
        <p className="muted small mt-1">Check which stored passages would be returned for a question. This uses the configured embedding service and your ready sources.</p>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={handleRetrievalCheck}>
          <div className="min-w-[240px] flex-1">
            <Field label="Sample question" htmlFor="kb-retrieval-query">
              <TextInput
                id="kb-retrieval-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={1000}
                placeholder="e.g. What is the refund policy?"
              />
            </Field>
          </div>
          <Button type="submit" size="md" disabled={retrievalLoading}>
            {retrievalLoading ? "Checking…" : "Check retrieval"}
          </Button>
        </form>
        {retrievalError && <p className="mt-2 text-sm text-err-ink" role="alert">{retrievalError}</p>}
        {retrieval && (
          <div className="mt-3" aria-live="polite">
            {retrieval.count === 0 ? (
              <p className="muted small">No matching passages were found in ready sources.</p>
            ) : (
              <div className="space-y-3">
                <p className="muted small">{retrieval.count} matching passage{retrieval.count === 1 ? "" : "s"} returned.</p>
                {retrieval.results.map((item, index) => (
                  <div className="border-l-2 border-line pl-3" key={`${item.documentId}-${index}`}>
                    <p className="m-0 text-sm text-ink whitespace-pre-wrap">{item.content}</p>
                    <p className="muted small mt-1">Similarity {item.similarity.toFixed(3)} · Source ID {item.documentId}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

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
            <table className="table min-w-[840px]">
              <thead><tr><th>Source</th><th>Version</th><th>Status</th><th>Uploaded</th><th>Actions</th></tr></thead>
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
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void handlePreview(doc.id)} disabled={doc.status !== "ready" || previewLoadingId === doc.id}>
                          {previewLoadingId === doc.id ? "Loading…" : "Preview"}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void handleDelete(doc.id)} disabled={deletingId === doc.id}>
                          {deletingId === doc.id ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageData && <Pagination page={pageData.page} totalPages={pageData.totalPages} total={pageData.total} pageSize={pageData.pageSize} onPageChange={setPage} label="documents" />}
        </>
      )}

      {preview && (
        <section className="mt-5 border-t border-line pt-4" aria-labelledby="kb-preview-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="kb-preview-heading" className="text-base font-semibold text-ink">{preview.filename}</h3>
              <p className="muted small mt-1">Indexed text preview · {preview.chunkCount} chunk{preview.chunkCount === 1 ? "" : "s"}</p>
              {preview.truncated && <p className="muted small mt-1">Preview is limited to the first 100,000 characters.</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Close preview</Button>
          </div>
          {preview.content ? (
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-card p-3 text-sm text-ink">{preview.content}</pre>
          ) : (
            <p className="muted small mt-3">The source has no indexed text available to preview.</p>
          )}
        </section>
      )}
    </section>
  );
}
