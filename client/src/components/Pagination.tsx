interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  label?: string;
  compact?: boolean;
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange, label = "items", compact = false }: PaginationProps) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <nav className="flex flex-col gap-3 border-t border-line px-4 py-3 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between md:px-5" aria-label={`${label} pagination`}>
      <span>Showing {start}–{end} of {total} {label}</span>
      {totalPages > 1 && (compact ? (
        <div className="flex items-center justify-between gap-2" role="group" aria-label="Pagination controls">
          <button type="button" disabled={page <= 1} className="rounded-lg border border-line bg-card px-2.5 py-1.5 font-medium text-ink disabled:opacity-40" onClick={() => onPageChange(page - 1)}>Previous</button>
          <span aria-current="page" className="px-1 font-medium">Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages} className="rounded-lg border border-line bg-card px-2.5 py-1.5 font-medium text-ink disabled:opacity-40" onClick={() => onPageChange(page + 1)}>Next</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Pagination controls">
          <button type="button" disabled={page <= 1} aria-label="Previous page" className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-line bg-card px-2 text-ink disabled:opacity-40" onClick={() => onPageChange(page - 1)}>Previous</button>
          {buildPageNumbers(page, totalPages).map((pageNumber, index) => pageNumber === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1" aria-hidden="true">…</span>
          ) : (
            <button key={pageNumber} type="button" aria-current={page === pageNumber ? "page" : undefined} className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold ${page === pageNumber ? "border-accent bg-chip text-accent" : "border-line bg-card text-subtle hover:text-ink"}`} onClick={() => onPageChange(pageNumber)}>{pageNumber}</button>
          ))}
          <button type="button" disabled={page >= totalPages} aria-label="Next page" className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-line bg-card px-2 text-ink disabled:opacity-40" onClick={() => onPageChange(page + 1)}>Next</button>
        </div>
      ))}
    </nav>
  );
}

function buildPageNumbers(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) pages.push("ellipsis");
  for (let value = start; value <= end; value += 1) pages.push(value);
  if (end < totalPages - 1) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}
