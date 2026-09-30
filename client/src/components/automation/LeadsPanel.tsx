import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Campaign, type LeadListItem, type Milestone, type PipelineStage, type TenantMember } from "../../api";
import { formatRelativeTime, handoffLabel, PIPELINE_STAGES } from "../../lib/leadFormatting";

const PAGE_SIZE = 10;

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function LeadsPanel({ tenantId, campaign }: { tenantId: string; campaign: Campaign }) {
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PipelineStage | "all">("all");
  const [page, setPage] = useState(0);
  const [capturedByLead, setCapturedByLead] = useState<Record<string, Record<string, string>>>({});
  const [savingOwnerFor, setSavingOwnerFor] = useState<string | null>(null);

  async function reload() {
    try {
      const [ms, allLeads, mem] = await Promise.all([
        api.listMilestones(tenantId, campaign.id),
        api.getLeads(tenantId),
        api.listMembers(tenantId),
      ]);
      const milestoneIds = new Set(ms.map((m) => m.id));
      setMilestones(ms);
      setMembers(mem);
      setLeads(allLeads.filter((l) => l.activeMilestoneId && milestoneIds.has(l.activeMilestoneId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, campaign.id]);

  const filtered = useMemo(() => {
    if (!leads) return null;
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.pipelineStage !== statusFilter) return false;
      if (q && !(l.username ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, search, statusFilter]);

  const pageItems = useMemo(() => {
    if (!filtered) return [];
    return filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    let cancelled = false;
    async function loadCapturedFacts() {
      const missing = pageItems.filter((l) => !(l.id in capturedByLead));
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(async (l) => [l.id, await api.getCapturedFacts(tenantId, l.id).catch(() => ({}))] as const),
      );
      if (cancelled) return;
      setCapturedByLead((prev) => {
        const next = { ...prev };
        for (const [id, facts] of entries) next[id] = facts;
        return next;
      });
    }
    loadCapturedFacts();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageItems, tenantId]);

  async function handleOwnerChange(leadId: string, ownerUserId: string) {
    setSavingOwnerFor(leadId);
    try {
      await api.updateLead(tenantId, leadId, { ownerUserId: ownerUserId || null });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reassign lead");
    } finally {
      setSavingOwnerFor(null);
    }
  }

  if (error) return <div className="banner banner-error">{error}</div>;
  if (!leads || !filtered) return <p className="muted">Loading…</p>;

  const totalCount = leads.length;
  const qualifiedCount = leads.filter((l) => ["qualified", "meeting_scheduled", "won"].includes(l.pipelineStage)).length;
  const meetingCount = leads.filter((l) => ["meeting_scheduled", "won"].includes(l.pipelineStage)).length;
  const wonCount = leads.filter((l) => l.pipelineStage === "won").length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="stat-grid">
        <StatTile value={totalCount} label="Total leads" />
        <StatTile value={qualifiedCount} label="Qualified" />
        <StatTile value={meetingCount} label="Meetings scheduled" />
        <StatTile value={wonCount} label="Closed / Won" />
      </div>

      <div className="filter-row">
        <input
          type="text"
          placeholder="Search by username..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          style={{ maxWidth: 220 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as PipelineStage | "all");
            setPage(0);
          }}
        >
          <option value="all">All Status</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No leads match these filters.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Captured Milestone</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Last Activity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((lead) => {
                const milestone = milestones.find((m) => m.id === lead.activeMilestoneId);
                const facts = capturedByLead[lead.id];
                const stage = PIPELINE_STAGES.find((s) => s.value === lead.pipelineStage);
                const handoff = handoffLabel(lead.handoffStatus);
                return (
                  <tr key={lead.id}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chip text-xs font-semibold text-accent">
                          {(lead.username ?? "?").charAt(0).toUpperCase()}
                        </span>
                        @{lead.username ?? "unknown"}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs">{milestone?.goalDescription ?? "—"}</div>
                      {facts && Object.keys(facts).length > 0 && (
                        <div className="muted small mt-0.5">
                          {Object.values(facts).slice(0, 2).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="pill" style={{ marginLeft: 0 }}>
                        {stage?.label ?? lead.pipelineStage}
                      </span>
                      {lead.handoffStatus !== "ai" && <span className={`${handoff.className} mt-1 block w-fit`}>{handoff.text}</span>}
                    </td>
                    <td>
                      <select
                        value={lead.ownerUserId ?? ""}
                        onChange={(e) => handleOwnerChange(lead.id, e.target.value)}
                        disabled={savingOwnerFor === lead.id}
                        style={{ minWidth: 120 }}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.email}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-xs">{formatRelativeTime(lead.lastInboundAt)}</td>
                    <td>
                      <Link to={`/dashboard/${tenantId}/leads/${lead.id}`} className="link-button">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-subtle">
          <span>
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary btn-small"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
