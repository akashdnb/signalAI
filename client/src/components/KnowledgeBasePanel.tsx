import { useEffect, useRef, useState } from "react";
import { api, type KnowledgeBaseDocument } from "../api";
import { getKnowledgeBaseDocumentsPage, type PaginatedResponse } from "../api/pagination";
import { EmptyState, ErrorState, LoadingState, Section, StatusBadge } from "./ui";
import { Pagination } from "./Pagination";

const STATUS_LABEL: Record<KnowledgeBaseDocument["status"], string> = {
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

function statusTone(status: KnowledgeBaseDocument["status"]): "neutral" | "success" | "danger" {
  if (status === "ready") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load knowledge sources");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, page, reloadToken]);

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadKnowledgeBaseDocument(tenantId, file);
      setPage(1);
      setReloadToken((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload knowledge source");
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
      setError(err instanceof Error ? err.message : "Failed to delete knowledge source");
    } finally {
      setDeletingId(null);
    }
  }

  function retryLoading() {
    setError(null);
    setReloadToken((value) => value + 1);
  }

  const documents = pageData?.items ?? null;
  const total = pageData?.total ?? null;

  return (
    <div className="knowledge-base-panel">
      {error && pageData !== null && <div className="banner banner-error" role="alert">{error}</div>}

      {documents === null && error ? (
        <ErrorState
          title="Couldn't load knowledge sources"
          description={error}
          action={<button type="button" className="btn-secondary btn-small" onClick={retryLoading}>Retry</button>}
        />
      ) : documents === null ? (
        <LoadingState label="Loading knowledge sources" description="Checking the sources available to ground AI replies." />
      ) : (
        <Section
          title="Source documents"
          description={
            total === null
              ? "PDF, TXT and Markdown sources are processed before they can ground an AI reply."
              : `${total.toLocaleString()} source${total === 1 ? "" : "s"} · only Ready sources are used to ground AI replies.`
          }
          className="knowledge-sources"
          actions={
            <>
              <button
                type="button"
                className="btn-primary btn-small"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : "Upload source"}
              </button>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                aria-label="Choose a knowledge source file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                onChange={handleFileSelected}
                disabled={uploading}
              />
            </>
          }
        >
          <p className="knowledge-upload-help muted small">
            PDF, plain text or Markdown, up to the server's configured upload limit. Processing begins after upload; failed sources are excluded from retrieval until replaced.
          </p>

          {documents.length === 0 ? (
            <EmptyState
              title="No knowledge sources yet"
              description="Upload your FAQ, pricing sheet or product information so AI replies can use your content instead of relying only on the conversation."
              className="knowledge-empty-state"
            />
          ) : (
            <>
              <div className="knowledge-table-scroll" role="region" aria-label="Knowledge source documents" tabIndex={0}>
                <table className="table knowledge-source-table">
                  <caption className="sr-only">Uploaded knowledge sources, versions, processing state and upload date</caption>
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Version</th>
                      <th scope="col">Status</th>
                      <th scope="col">Uploaded</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <strong className="knowledge-source-name">{document.filename}</strong>
                          <div className="muted small">{document.contentType}</div>
                        </td>
                        <td>{document.version}</td>
                        <td>
                          <StatusBadge tone={statusTone(document.status)} dot>{STATUS_LABEL[document.status]}</StatusBadge>
                          {document.status === "processing" && <div className="muted small mt-1">Preparing this source for retrieval.</div>}
                          {document.status === "ready" && <div className="muted small mt-1">Available for grounded replies.</div>}
                          {document.status === "failed" && document.errorReason && <div className="muted small mt-1 knowledge-source-error">{document.errorReason}</div>}
                        </td>
                        <td className="knowledge-source-date" title={formatDate(document.createdAt)}>
                          <time dateTime={document.createdAt}>{formatDate(document.createdAt)}</time>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary btn-small"
                            onClick={() => void handleDelete(document.id)}
                            disabled={deletingId !== null}
                            aria-label={`Delete ${document.filename}`}
                          >
                            {deletingId === document.id ? "Deleting…" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pageData && (
                <Pagination
                  page={pageData.page}
                  totalPages={pageData.totalPages}
                  total={pageData.total}
                  pageSize={pageData.pageSize}
                  onPageChange={setPage}
                  label="documents"
                />
              )}
            </>
          )}
        </Section>
      )}
    </div>
  );
}
