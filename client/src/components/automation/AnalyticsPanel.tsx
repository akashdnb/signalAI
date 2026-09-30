import { useEffect, useMemo, useState } from "react";
import { api, type Campaign, type CampaignAnalytics, type Dropoff, type LeadListItem, type TenantMember } from "../../api";
import { formatRelativeTime } from "../../lib/leadFormatting";

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function FunnelBar({ label, count, of }: { label: string; count: number; of: number }) {
  const pct = of > 0 ? Math.round((count / of) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-subtle">
        <span>{label}</span>
        <span>
          {count.toLocaleString()} <span className="text-subtle">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-chip">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TimeseriesChart({ data }: { data: CampaignAnalytics["timeseries"] }) {
  const width = 640;
  const height = 180;
  const padding = { top: 10, right: 10, bottom: 22, left: 10 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.comments, d.messages)));
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: padding.left + i * stepX,
    comments: padding.top + plotH - (d.comments / maxValue) * plotH,
    messages: padding.top + plotH - (d.messages / maxValue) * plotH,
  }));
  const path = (key: "comments" | "messages") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p[key].toFixed(1)}`).join(" ");

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-subtle">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          Comments matched
        </span>
        <span className="flex items-center gap-1.5 text-subtle">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent-cyan)" }} />
          Messages matched
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Matched comments and messages over the last 30 days">
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={padding.left} x2={width - padding.right} y1={padding.top + plotH * f} y2={padding.top + plotH * f} stroke="var(--border)" strokeWidth={1} />
        ))}
        <path d={path("comments")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={path("messages")} fill="none" stroke="var(--accent-cyan)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
          <text key={i} x={points[i]?.x ?? 0} y={height - 4} fontSize="11" fill="var(--text-muted)" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
            {data[i] ? new Date(data[i]!.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function AnalyticsPanel({ tenantId, campaign }: { tenantId: string; campaign: Campaign }) {
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [dropoff, setDropoff] = useState<Dropoff[] | null>(null);
  const [journeyLeads, setJourneyLeads] = useState<LeadListItem[] | null>(null);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, d, ms, allLeads, mem] = await Promise.all([
          api.getCampaignAnalytics(tenantId, campaign.id),
          api.getDropoff(tenantId, campaign.id),
          api.listMilestones(tenantId, campaign.id),
          api.getLeads(tenantId),
          api.listMembers(tenantId),
        ]);
        if (cancelled) return;
        const milestoneIds = new Set(ms.map((m) => m.id));
        setAnalytics(a);
        setDropoff(d);
        setJourneyLeads(allLeads.filter((l) => l.activeMilestoneId && milestoneIds.has(l.activeMilestoneId)));
        setMembers(mem);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, campaign.id]);

  const stageCounts = useMemo(() => {
    if (!journeyLeads) return null;
    return {
      total: journeyLeads.length,
      qualified: journeyLeads.filter((l) => ["qualified", "meeting_scheduled", "won"].includes(l.pipelineStage)).length,
      meeting: journeyLeads.filter((l) => ["meeting_scheduled", "won"].includes(l.pipelineStage)).length,
      won: journeyLeads.filter((l) => l.pipelineStage === "won").length,
    };
  }, [journeyLeads]);

  const attention = useMemo(() => {
    if (!journeyLeads) return [];
    const items: string[] = [];
    const staleUnread = journeyLeads.filter((l) => {
      if (!l.unread || !l.lastInboundAt) return false;
      return Date.now() - new Date(l.lastInboundAt).getTime() > 24 * 60 * 60 * 1000;
    });
    if (staleUnread.length > 0) {
      items.push(`${staleUnread.length} conversation${staleUnread.length === 1 ? "" : "s"} unread for over a day`);
    }
    const unassigned = journeyLeads.filter((l) => !l.ownerUserId);
    if (unassigned.length > 0 && members.length > 0) {
      items.push(`${unassigned.length} lead${unassigned.length === 1 ? "" : "s"} not assigned to anyone`);
    }
    const escalated = journeyLeads.filter((l) => l.handoffStatus === "requested");
    if (escalated.length > 0) {
      items.push(`${escalated.length} conversation${escalated.length === 1 ? "" : "s"} waiting for human handoff`);
    }
    return items;
  }, [journeyLeads, members]);

  if (error) return <div className="banner banner-error">{error}</div>;
  if (!analytics || !dropoff || !journeyLeads || !stageCounts) return <p className="muted">Loading…</p>;

  const matchedTotal = analytics.commentsMatched + analytics.messagesMatched;
  const maxDropoff = Math.max(...dropoff.map((d) => d.advancedCount), 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="stat-grid">
        <StatTile value={analytics.commentsMatched.toLocaleString()} label="Comments matched" />
        <StatTile value={analytics.messagesMatched.toLocaleString()} label="Messages matched" />
        <StatTile value={analytics.conversationsStarted.toLocaleString()} label="Conversations started" />
        <StatTile value={stageCounts.total.toLocaleString()} label="Leads in journey" />
        <StatTile value={stageCounts.qualified.toLocaleString()} label="Qualified" />
        <StatTile value={stageCounts.won.toLocaleString()} label="Won" />
      </div>

      <section className="card">
        <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">Conversion Funnel</h3>
        <div className="flex flex-col gap-2.5">
          <FunnelBar label="Matched (comments + messages)" count={matchedTotal} of={matchedTotal} />
          <FunnelBar label="Conversations started" count={analytics.conversationsStarted} of={matchedTotal} />
          <FunnelBar label="Leads in journey" count={stageCounts.total} of={matchedTotal} />
          <FunnelBar label="Qualified" count={stageCounts.qualified} of={matchedTotal} />
          <FunnelBar label="Meeting scheduled" count={stageCounts.meeting} of={matchedTotal} />
          <FunnelBar label="Won" count={stageCounts.won} of={matchedTotal} />
        </div>
      </section>

      <section className="card">
        <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">Conversations Over Time</h3>
        {analytics.timeseries.every((p) => p.comments === 0 && p.messages === 0) ? (
          <p className="muted">No matched activity in the last 30 days yet.</p>
        ) : (
          <TimeseriesChart data={analytics.timeseries} />
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="card mb-0">
          <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">Breakdown by Source</h3>
          {matchedTotal === 0 ? (
            <p className="muted">No matched events yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <FunnelBar label="Comments" count={analytics.commentsMatched} of={matchedTotal} />
              <FunnelBar label="Direct messages" count={analytics.messagesMatched} of={matchedTotal} />
            </div>
          )}
        </section>

        <section className="card mb-0">
          <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">Milestone Drop-off</h3>
          {dropoff.length === 0 ? (
            <p className="muted">No milestones yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {dropoff.map((d) => (
                <div key={d.milestoneId}>
                  <div className="flex justify-between text-xs text-subtle">
                    <span>
                      {d.ordinal + 1}. {d.goalDescription}
                    </span>
                    <span>{d.advancedCount}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-chip">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(d.advancedCount / maxDropoff) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">AI Behaviour Summary</h3>
        <p className="muted small m-0">
          Reply mode: <strong className="text-ink">{campaign.replyMode === "ai_generated" ? "AI-generated" : "Rule-based"}</strong>
          {" · "}Tone: <strong className="text-ink">{campaign.tone.replace(/_/g, " ")}</strong>
          {" · "}Knowledge Base: <strong className="text-ink">{campaign.useKnowledgeBase ? "On" : "Off"}</strong>
        </p>
      </section>

      <section className="card">
        <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">Needs Attention</h3>
        {attention.length === 0 ? (
          <p className="muted m-0">Nothing needs attention right now.</p>
        ) : (
          <ul className="m-0 list-none space-y-1.5 p-0 text-sm">
            {attention.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5 text-err-ink">•</span>
                {item}
              </li>
            ))}
          </ul>
        )}
        {journeyLeads.length > 0 && (
          <p className="muted small mt-2">
            Most recent activity {formatRelativeTime(journeyLeads[0]?.lastInboundAt ?? null)}.
          </p>
        )}
      </section>
    </div>
  );
}
