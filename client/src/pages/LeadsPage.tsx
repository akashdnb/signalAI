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
    <div className="page page-wide page-leads">
      <header className="leads-page-header">
        <div>
          <p className="section-eyebrow">PIPELINE</p>
          <h1>Leads</h1>
          <p className="page-description">Track people who have shown interest in your business through Instagram.</p>
        </div>
        {pageData && <div className="leads-total" aria-label={`${pageData.total} leads in this view`}><strong>{pageData.total}</strong><span>leads</span></div>}
      </header>

      {error && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>
            Retry
          </button>
        </div>
      )}

      <section className="card leads-workspace" aria-label="Lead pipeline">
        <div className="leads-toolbar">
          <div className="leads-filter-group">
            <label className="sr-only" htmlFor="leads-stage-filter">Pipeline stage</label>
            <select id="leads-stage-filter" aria-label="Pipeline stage" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as PipelineStage | "")}>
              <option value="">All stages</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="leads-handoff-filter">Handoff status</label>
            <select id="leads-handoff-filter" aria-label="Handoff status" value={handoffFilter} onChange={(e) => setHandoffFilter(e.target.value as HandoffStatus | "")}>
              {HANDOFF_FILTERS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          <label className="leads-search">
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
          <div className="leads-empty">
            <strong>No leads match this view.</strong>
            <span>Try clearing a filter or searching for a different username.</span>
          </div>
        ) : (
          <>
            <div className="leads-table-scroll" aria-label="Scrollable leads table">
              <table className="table leads-data-table">
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
                          <Link className="lead-primary-link" to={`/dashboard/${tenantId}/leads/${lead.id}`}>
                            {lead.unread && <span className="lead-unread-dot" aria-label="Unread" />}
                            <span className="lead-identity">
                              <strong>{leadDisplayName(lead.username)}</strong>
                              <small>{lead.username ? `@${lead.username.replace(/^@/, "")}` : "Instagram username unavailable"}</small>
                            </span>
                          </Link>
                        </td>
                        <td>{PIPELINE_STAGES.find((s) => s.value === lead.pipelineStage)?.label ?? lead.pipelineStage}</td>
                        <td>{sourceLabel(lead.lastEventType)}</td>
                        <td>
                          <span className="lead-activity">
                            <time dateTime={lead.lastInboundAt ?? undefined} title={lead.lastInboundAt ? new Date(lead.lastInboundAt).toLocaleString() : undefined}>{lead.lastInboundAt ? formatRelativeTime(lead.lastInboundAt) : "No activity"}</time>
                            {lead.lastMessagePreview && <small title={lead.lastMessagePreview}>{lead.lastMessagePreview}</small>}
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
