import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type HandoffStatus, type LeadListItem, type PipelineStage, type TenantMember } from "../api";
import { getLeadsPage, type PaginatedResponse } from "../api/pagination";
import { Pagination } from "../components/Pagination";
import { PIPELINE_STAGES, formatLastContactVia, formatMessagingWindow, formatRelativeTime, handoffLabel, leadDisplayName } from "../lib/leadFormatting";
import { useTenant } from "../context/TenantContext";

const HANDOFF_FILTERS: { value: HandoffStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "ai", label: "AI Handling" },
  { value: "requested", label: "Needs Attention" },
  { value: "human", label: "Human Handling" },
];

const PAGE_SIZE = 20;

export function LeadsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { selectedAccountId } = useTenant();

  const [pageData, setPageData] = useState<PaginatedResponse<LeadListItem> | null>(null);
  const [members, setMembers] = useState<TenantMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");
  const [handoffFilter, setHandoffFilter] = useState<HandoffStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [stageFilter, handoffFilter, search, selectedAccountId]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    api.listMembers(tenantId).then((result) => {
      if (cancelled) return;
      setMembers(result);
      setMembersError(null);
    }).catch((err) => {
      if (cancelled) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate("/login", { replace: true });
        return;
      }
      setMembersError(err instanceof Error ? err.message : "Owner details are unavailable.");
    });
    return () => { cancelled = true; };
  }, [tenantId, navigate]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      try {
        const result = await getLeadsPage(tenantId!, page, PAGE_SIZE, {
          stage: stageFilter || undefined,
          handoffStatus: handoffFilter || undefined,
          q: search.trim() || undefined,
          accountId: selectedAccountId || undefined,
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
  }, [tenantId, stageFilter, handoffFilter, search, selectedAccountId, page, reloadCount, navigate]);

  if (!tenantId) return null;

  const leads = pageData?.items ?? null;

  return (
    <div className="page page-wide page-leads">
      <h1>Leads</h1>

      {error && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>
            Retry
          </button>
        </div>
      )}

      <section className="card">
        <div className="filter-row">
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
          <label className="sr-only" htmlFor="leads-search">Search leads by username</label>
          <input
            id="leads-search"
            type="text"
            aria-label="Search leads by username"
            placeholder="Search by username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {leads === null ? (
          <p className="muted" role="status">{error ? "Leads could not be loaded. Use Retry above." : "Loading…"}</p>
        ) : leads.length === 0 ? (
          <p className="muted">No leads match this view yet.</p>
        ) : (
          <>
            <div className="-mx-2 overflow-x-auto sm:mx-0" aria-label="Scrollable leads table">
              <table className="table leads-data-table min-w-[980px]">
                <thead><tr><th>Lead</th><th>Stage</th><th>Handoff</th><th>Owner</th><th>Last activity</th><th>Via</th><th>Messaging window</th><th>First seen</th></tr></thead>
                <tbody>
                  {leads.map((lead) => {
                    const messagingWindow = formatMessagingWindow(lead.windowOpenUntil);
                    return (
                      <tr key={lead.id}>
                        <td>
                          <Link to={`/dashboard/${tenantId}/leads/${lead.id}`}>
                            {lead.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" style={{ display: "inline-block", marginRight: "0.4rem" }} aria-hidden="true" />}
                            <span className="inline-flex flex-col align-top">
                              <span>{leadDisplayName(lead.username)}</span>
                              {!lead.username && <span className="muted small">Username unavailable</span>}
                            </span>
                          </Link>
                        </td>
                        <td>{PIPELINE_STAGES.find((s) => s.value === lead.pipelineStage)?.label ?? lead.pipelineStage}</td>
                        <td>
                          <span className={handoffLabel(lead.handoffStatus).className} style={{ marginLeft: 0 }}>{handoffLabel(lead.handoffStatus).text}</span>
                          {lead.handoffStatus === "requested" && !lead.ownerUserId && (
                            <span className="block muted small mt-1">Unassigned handoff</span>
                          )}
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
                        <td><time dateTime={lead.lastInboundAt ?? undefined} title={lead.lastInboundAt ? new Date(lead.lastInboundAt).toLocaleString() : undefined}>{lead.lastInboundAt ? formatRelativeTime(lead.lastInboundAt) : "—"}</time></td>
                        <td>{formatLastContactVia(lead.lastEventType)}</td>
                        <td>
                          <span className={messagingWindow.open ? "pill pill-ok" : "pill"} title={messagingWindow.title} style={{ marginLeft: 0 }}>
                            {messagingWindow.label}
                          </span>
                        </td>
                        <td><time dateTime={lead.createdAt} title={new Date(lead.createdAt).toLocaleString()}>{formatRelativeTime(lead.createdAt)}</time></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pageData && (
              <p className="muted small mt-3" role="status">
                Showing {pageData.items.length} of {pageData.total.toLocaleString()} leads{stageFilter || handoffFilter || search.trim() ? " matching the current filters" : ""}.
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
