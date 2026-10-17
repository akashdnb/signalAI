import { useEffect, useRef, useState } from "react";
import { api, type KnowledgeBaseDocument, type KnowledgeBaseDocumentPreview, type KnowledgeRetrievalResponse } from "../api";
import { getKnowledgeBaseDocumentsPage, type PaginatedResponse } from "../api/pagination";
import { Button, EmptyState, ErrorState, Field, LoadingState, Section, StatusBadge, TextInput } from "./ui";
import { Pagination } from "./Pagination";
import { SearchIcon } from "./icons";

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
  const [search, setSearch] = useState("");
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
      if (preview?.documentId === documentId) setPreview(null);
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
  const total = pageData?.total ?? null;
  const trimmedSearch = search.trim().toLowerCase();
  const filteredDocuments = documents?.filter((document) => document.filename.toLowerCase().includes(trimmedSearch)) ?? null;

  return (
    <div className="knowledge-base-panel">
      {error && pageData !== null && <div className="banner banner-error" role="alert">{error}</div>}

      <section className="mb-6 border-b border-line pb-5">
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
            <div className="knowledge-upload-actions">
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
            </div>
          }
        >
          <p className="knowledge-upload-help muted small">
            PDF, plain text or Markdown, up to the server's configured upload limit. Processing begins after upload; failed sources are excluded from retrieval until replaced.
          </p>

          {documents.length > 0 && (
            <div className="mb-4 min-w-0 max-w-sm">
              <label htmlFor="knowledge-search" className="mb-1.5 block text-xs font-medium text-subtle">
                Search
              </label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                <input
                  id="knowledge-search"
                  type="search"
                  aria-label="Search source files"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search source files"
                  className="!m-0 !h-11 !w-full !rounded-xl !bg-card !pl-10 !pr-14 !text-sm"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-xs font-semibold text-subtle hover:bg-chip hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => setSearch("")}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {documents.length === 0 ? (
            <EmptyState
              title="No knowledge sources yet"
              description="Upload your FAQ, pricing sheet or product information so AI replies can use your content instead of relying only on the conversation."
              className="knowledge-empty-state"
            />
          ) : filteredDocuments && filteredDocuments.length === 0 ? (
            <EmptyState
              title="No sources match your search"
              description={`No source filenames on this page match "${search.trim()}".${pageData && pageData.totalPages > 1 ? " Try another page or clear the search." : ""}`}
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
                    {filteredDocuments!.map((document) => (
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
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-secondary btn-small"
                              onClick={() => void handlePreview(document.id)}
                              disabled={document.status !== "ready" || previewLoadingId === document.id}
                              aria-label={`Preview ${document.filename}`}
                            >
                              {previewLoadingId === document.id ? "Loading…" : "Preview"}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-small"
                              onClick={() => void handleDelete(document.id)}
                              disabled={deletingId !== null}
                              aria-label={`Delete ${document.filename}`}
                            >
                              {deletingId === document.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
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
    </div>
  );
}
