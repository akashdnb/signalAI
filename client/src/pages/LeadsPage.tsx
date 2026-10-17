import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, type HandoffStatus, type LeadListItem, type PipelineStage, type TenantMember } from "../api";
import { getLeadsPage, type PaginatedResponse } from "../api/pagination";
import { Pagination } from "../components/Pagination";
import { PIPELINE_STAGES, formatLastContactVia, formatMessagingWindow, formatRelativeTime, handoffLabel, leadDisplayName } from "../lib/leadFormatting";
import { useTenant } from "../context/TenantContext";

const HANDOFF_FILTERS: { value: HandoffStatus | ""; label: string }[] = [
  { value: "", label: "All handoffs" },
  { value: "ai", label: "AI handling" },
  { value: "requested", label: "Needs attention" },
  { value: "human", label: "Human handling" },
];

const PAGE_SIZE = 20;

export function LeadsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { selectedAccountId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceFilter = searchParams.get("sourceMediaId")?.trim() || undefined;
  const [pageData, setPageData] = useState<PaginatedResponse<LeadListItem> | null>(null);
  const [members, setMembers] = useState<TenantMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");
  const [handoffFilter, setHandoffFilter] = useState<HandoffStatus | "">("");
  const [qualificationFilter, setQualificationFilter] = useState<"qualified" | "unqualified" | "">("");
  const [activityFrom, setActivityFrom] = useState("");
  const [activityTo, setActivityTo] = useState("");
  const [sort, setSort] = useState<"activity_desc" | "activity_asc" | "created_desc" | "created_asc" | "stage_asc" | "stage_desc" | "username_asc" | "username_desc">("activity_desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  useEffect(() => { setPage(1); }, [stageFilter, handoffFilter, qualificationFilter, activityFrom, activityTo, sort, search, sourceFilter]);
  useEffect(() => { setPageData(null); setError(null); }, [tenantId, selectedAccountId]);
  useEffect(() => { if (!tenantId) return; let cancelled = false; api.listMembers(tenantId).then((result) => { if (cancelled) return; setMembers(result); setMembersError(null); }).catch((err) => { if (cancelled) return; if (err instanceof ApiError && (err.status === 401)) { navigate("/login", { replace: true }); return; } setMembersError(err instanceof Error ? err.message : "Owner details are unavailable."); }); return () => { cancelled = true; }; }, [tenantId, navigate]);
  useEffect(() => { if (!tenantId) return; let cancelled = false; async function load() { try { const result = await getLeadsPage(tenantId!, page, PAGE_SIZE, { stage: stageFilter || undefined, handoffStatus: handoffFilter || undefined, qualification: qualificationFilter || undefined, from: activityFrom || undefined, to: activityTo || undefined, sort, q: search.trim() || undefined, sourceMediaId: sourceFilter, accountId: selectedAccountId || undefined }); if (cancelled) return; setPageData(result); if (result.page !== page) setPage(result.page); setError(null); } catch (err) { if (cancelled) return; if (err instanceof ApiError && (err.status === 401)) { navigate("/login", { replace: true }); return; } setError(err instanceof Error ? err.message : "Failed to load leads"); } } load(); return () => { cancelled = true; }; }, [tenantId, stageFilter, handoffFilter, qualificationFilter, activityFrom, activityTo, sort, search, sourceFilter, selectedAccountId, page, reloadCount, navigate]);
  if (!tenantId) return null;

  const leads = pageData?.items ?? null;

  function clearSourceFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("sourceMediaId");
    setSearchParams(next, { replace: true });
  }

  const hasActiveFilters = Boolean(stageFilter || handoffFilter || qualificationFilter || activityFrom || activityTo || search.trim() || sourceFilter);

  return (
    <div className="page page-wide page-leads">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Pipeline</p>
          <h1>Leads</h1>
          <p className="m-0 max-w-2xl text-sm text-subtle">Track people who have shown interest in your business through Instagram.</p>
        </div>
        {pageData && <div className="text-right" aria-label={`${pageData.total} leads in this view`}><strong className="block text-2xl font-semibold leading-none">{pageData.total}</strong><span className="text-xs text-subtle">leads</span></div>}
      </header>

      {sourceFilter && (
        <div className="banner mb-4">
          <strong>Leads linked through comments on post</strong>
          <p className="muted small m-0 mt-1">Showing leads with a recorded comment event for post <code>{sourceFilter}</code>. This is not conversion attribution.</p>
          <button type="button" className="link-button mt-2 inline-block" onClick={clearSourceFilter}>Clear post filter</button>
        </div>
      )}

      {error && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>
            Retry
          </button>
        </div>
      )}

      <section className="card" aria-label="Lead pipeline">
        <div className="filter-row mb-4 flex flex-wrap items-end gap-2 border-b border-line pb-4">
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
          <label className="w-full sm:ml-auto sm:max-w-xs">
            <span className="sr-only">Search leads by username or captured details</span>
            <input
              id="leads-search"
              type="text"
              aria-label="Search leads by username or captured details"
              placeholder="Search username, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-semibold text-subtle">More filters</summary>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="sr-only" htmlFor="leads-qualification-filter">Qualification</label>
              <select className="!mt-0 w-auto min-w-[160px]" id="leads-qualification-filter" aria-label="Qualification" value={qualificationFilter} onChange={(e) => setQualificationFilter(e.target.value as "qualified" | "unqualified" | "")}>
                <option value="">All qualification</option>
                <option value="qualified">Qualified</option>
                <option value="unqualified">Not qualified</option>
              </select>
              <label className="sr-only" htmlFor="leads-activity-from">Activity from</label>
              <input className="!mt-0 w-auto" id="leads-activity-from" type="date" aria-label="Activity from" value={activityFrom} max={activityTo || undefined} onChange={(e) => setActivityFrom(e.target.value)} />
              <label className="sr-only" htmlFor="leads-activity-to">Activity to</label>
              <input className="!mt-0 w-auto" id="leads-activity-to" type="date" aria-label="Activity to" min={activityFrom || undefined} value={activityTo} onChange={(e) => setActivityTo(e.target.value)} />
              <label className="sr-only" htmlFor="leads-sort">Sort leads</label>
              <select className="!mt-0 w-auto min-w-[170px]" id="leads-sort" aria-label="Sort leads" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="activity_desc">Most recent activity</option>
                <option value="activity_asc">Oldest activity</option>
                <option value="created_desc">Newest leads</option>
                <option value="created_asc">Oldest leads</option>
                <option value="stage_asc">Stage A–Z</option>
                <option value="stage_desc">Stage Z–A</option>
                <option value="username_asc">Username A–Z</option>
                <option value="username_desc">Username Z–A</option>
              </select>
            </div>
          </details>
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
                  <tr><th>Lead</th><th>Stage</th><th>Handoff</th><th>Owner</th><th>Last activity</th><th>Via</th><th>Messaging window</th><th>First seen</th></tr>
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
                        <td>
                          <span className={handoff.className} style={{ marginLeft: 0 }}>{handoff.text}</span>
                          {lead.handoffStatus === "requested" && !lead.ownerUserId && <span className="block muted small mt-1">Unassigned handoff</span>}
                        </td>
                        <td className="max-w-[14rem]">
                          {lead.ownerUserId
                            ? (members?.find((member) => member.userId === lead.ownerUserId)?.email ?? (membersError ? "Owner details unavailable" : "Assigned teammate"))
                            : "Unassigned"}
                          {lead.handoffStatus === "requested" && (
                            <Link className="link-button block mt-1" to={`/dashboard/${tenantId}/leads/${lead.id}`}>
                              {lead.ownerUserId ? "Review handoff" : "Assign / review"}
                            </Link>
                          )}
                        </td>
                        <td>
                          <span className="inline-flex max-w-[280px] flex-col align-top">
                            <time dateTime={lead.lastInboundAt ?? undefined} title={lead.lastInboundAt ? new Date(lead.lastInboundAt).toLocaleString() : undefined}>{lead.lastInboundAt ? formatRelativeTime(lead.lastInboundAt) : "No activity"}</time>
                            {lead.lastMessagePreview && <small className="truncate text-subtle" title={lead.lastMessagePreview}>{lead.lastMessagePreview}</small>}
                          </span>
                        </td>
                        <td>{formatLastContactVia(lead.lastEventType)}</td>
                        <td><span className={messagingWindow.open ? "pill pill-ok" : "pill"} title={messagingWindow.title} style={{ marginLeft: 0 }}>{messagingWindow.label}</span></td>
                        <td><time dateTime={lead.createdAt} title={new Date(lead.createdAt).toLocaleString()}>{formatRelativeTime(lead.createdAt)}</time></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pageData && (
              <p className="muted small mt-3" role="status">
                Showing {pageData.items.length} of {pageData.total.toLocaleString()} leads{hasActiveFilters ? " matching the current filters" : ""}.
              </p>
            )}
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
