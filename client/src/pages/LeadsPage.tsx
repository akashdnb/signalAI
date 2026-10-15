import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, type HandoffStatus, type LeadListItem, type PipelineStage } from "../api";
import { getLeadsPage, type PaginatedResponse } from "../api/pagination";
import { Pagination } from "../components/Pagination";
import { PIPELINE_STAGES, formatMessagingWindow, formatRelativeTime, handoffLabel, leadDisplayName } from "../lib/leadFormatting";

const HANDOFF_FILTERS: { value: HandoffStatus | ""; label: string }[] = [
  { value: "", label: "All handoffs" },
  { value: "ai", label: "AI handling" },
  { value: "requested", label: "Needs attention" },
  { value: "human", label: "Human handling" },
];

const PAGE_SIZE = 20;

function sourceLabel(eventType: LeadListItem["lastEventType"]): string {
  if (eventType === "comment") return "Comment";
  if (eventType === "message") return "DM";
  return "—";
}

export function LeadsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [pageData, setPageData] = useState<PaginatedResponse<LeadListItem> | null>(null);
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");
  const [handoffFilter, setHandoffFilter] = useState<HandoffStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [stageFilter, handoffFilter, search]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      try {
        const result = await getLeadsPage(tenantId!, page, PAGE_SIZE, {
          stage: stageFilter || undefined,
          handoffStatus: handoffFilter || undefined,
          q: search.trim() || undefined,
        });
        if (cancelled) return;
        setPageData(result);
        if (result.page !== page) setPage(result.page);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load leads");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, stageFilter, handoffFilter, search, page, reloadCount, navigate]);

  if (!tenantId) return null;

  const leads = pageData?.items ?? null;

  return (
    <div className="page page-wide">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Pipeline</p>
          <h1>Leads</h1>
          <p className="m-0 max-w-2xl text-sm text-subtle">Track people who have shown interest in your business through Instagram.</p>
        </div>
        {pageData && <div className="text-right" aria-label={`${pageData.total} leads in this view`}><strong className="block text-2xl font-semibold leading-none">{pageData.total}</strong><span className="text-xs text-subtle">leads</span></div>}
      </header>

      {error && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>
            Retry
          </button>
        </div>
      )}

      <section className="card" aria-label="Lead pipeline">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <label className="sr-only" htmlFor="leads-stage-filter">Pipeline stage</label>
            <select className="!mt-0 w-auto min-w-[150px]" id="leads-stage-filter" aria-label="Pipeline stage" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as PipelineStage | "")}>
              <option value="">All stages</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="leads-handoff-filter">Handoff status</label>
            <select className="!mt-0 w-auto min-w-[160px]" id="leads-handoff-filter" aria-label="Handoff status" value={handoffFilter} onChange={(e) => setHandoffFilter(e.target.value as HandoffStatus | "")}>
              {HANDOFF_FILTERS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          <label className="w-full sm:max-w-xs">
            <span className="sr-only">Search leads by username</span>
            <input
              id="leads-search"
              type="text"
              aria-label="Search leads by username"
              placeholder="Search leads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {leads === null ? (
          <p className="muted" role="status">{error ? "Leads could not be loaded. Use Retry above." : "Loading…"}</p>
        ) : leads.length === 0 ? (
          <div className="py-10 text-center">
            <strong className="block">No leads match this view.</strong>
            <span className="text-sm text-subtle">Try clearing a filter or searching for a different username.</span>
          </div>
        ) : (
          <>
            <div className="-mx-2 overflow-x-auto sm:mx-0" aria-label="Scrollable leads table">
              <table className="table leads-data-table min-w-[980px]">
                <thead>
                  <tr><th>Lead</th><th>Stage</th><th>Source</th><th>Activity</th><th>Owner</th><th>Handoff</th><th>Messaging</th></tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const messagingWindow = formatMessagingWindow(lead.windowOpenUntil);
                    const handoff = handoffLabel(lead.handoffStatus);
                    return (
                      <tr key={lead.id}>
                        <td>
                          <Link className="inline-flex items-center gap-2 no-underline" to={`/dashboard/${tenantId}/leads/${lead.id}`}>
                            {lead.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                            <span className="inline-flex min-w-0 flex-col">
                              <strong>{leadDisplayName(lead.username)}</strong>
                              <small className="text-subtle">{lead.username ? `@${lead.username.replace(/^@/, "")}` : "Instagram username unavailable"}</small>
                            </span>
                          </Link>
                        </td>
                        <td>{PIPELINE_STAGES.find((s) => s.value === lead.pipelineStage)?.label ?? lead.pipelineStage}</td>
                        <td>{sourceLabel(lead.lastEventType)}</td>
                        <td>
                          <span className="inline-flex max-w-[280px] flex-col align-top">
                            <time dateTime={lead.lastInboundAt ?? undefined} title={lead.lastInboundAt ? new Date(lead.lastInboundAt).toLocaleString() : undefined}>{lead.lastInboundAt ? formatRelativeTime(lead.lastInboundAt) : "No activity"}</time>
                            {lead.lastMessagePreview && <small className="truncate text-subtle" title={lead.lastMessagePreview}>{lead.lastMessagePreview}</small>}
                          </span>
                        </td>
                        <td>{lead.ownerUserId ? "Assigned" : "Unassigned"}</td>
                        <td><span className={handoff.className} style={{ marginLeft: 0 }}>{handoff.text}</span></td>
                        <td><span className={messagingWindow.open ? "pill pill-ok" : "pill"} title={messagingWindow.title} style={{ marginLeft: 0 }}>{messagingWindow.label}</span></td>
                      </tr>
                    );
                  })}
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
                label="leads"
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
