import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  api,
  type AccountHealth,
  type Analytics,
  type Campaign,
  type ConversationsTimeseriesPoint,
  type Funnel,
  type LeadListItem,
  type PipelineStage,
  type RevenueByCurrency,
} from "../api";
import { ConversationsChart } from "../components/ConversationsChart";
import { CheckCircleIcon } from "../components/icons";
import { StatusBadge } from "../components/ui";
import { PIPELINE_STAGES, formatRelativeTime, leadDisplayName } from "../lib/leadFormatting";

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

type ReportingPeriod = "7d" | "30d" | "month" | "all";

const PERIOD_OPTIONS: { value: ReportingPeriod; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

const PERIOD_NOTE: Record<ReportingPeriod, string> = {
  "7d": "in last 7 days",
  "30d": "in last 30 days",
  month: "this month",
  all: "in all time",
};

/** Real cutoff for the selected reporting period — `null` means "All time" (no filtering). */
function periodStart(period: ReportingPeriod): Date | null {
  const now = new Date();
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

/**
 * getConversationsTimeseries only returns rows for days that actually had
 * activity, so a bounded period (7d/30d/month) with sparse real data
 * clustered all its bars to one side with no slot at all for quiet days —
 * unlike the preview's always-full 7-column grid. Filling the gaps with
 * explicit zero-event days (never fabricating a count, just making absence
 * visible) keeps every day in the window on the x-axis.
 */
function fillDailySeries(data: ConversationsTimeseriesPoint[], start: Date, end: Date): ConversationsTimeseriesPoint[] {
  const byDay = new Map(data.map((point) => [new Date(point.date).toDateString(), point]));
  const days: ConversationsTimeseriesPoint[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= lastDay) {
    const existing = byDay.get(cursor.toDateString());
    days.push(existing ?? { date: cursor.toISOString(), comments: 0, dms: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function formatMoney(revenue: RevenueByCurrency[]): string {
  if (revenue.length === 0) return "—";
  const [top, ...rest] = revenue;
  const symbol = CURRENCY_SYMBOL[top!.currency];
  const amount = top!.total.toLocaleString();
  const primary = symbol ? `${symbol}${amount}` : `${top!.currency} ${amount}`;
  return rest.length > 0 ? `${primary} +${rest.length} more` : primary;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="overview-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export function DashboardPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [account, setAccount] = useState<AccountHealth | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [revenue, setRevenue] = useState<RevenueByCurrency[] | null>(null);
  const [timeseries, setTimeseries] = useState<ConversationsTimeseriesPoint[] | null>(null);
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [definitionsOpen, setDefinitionsOpen] = useState(false);
  const [period, setPeriod] = useState<ReportingPeriod>("7d");
  const justConnected = searchParams.get("connected") === "1";

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      setDataLoadError(null);
      try {
        const [a, f, r, ts, l, acc, c] = await Promise.all([
          api.getAnalytics(tenantId!),
          api.getFunnel(tenantId!),
          api.getRevenue(tenantId!),
          api.getConversationsTimeseries(tenantId!),
          api.getLeads(tenantId!),
          api.getAccountHealth(tenantId!),
          api.listCampaigns(tenantId!),
        ]);
        if (cancelled) return;
        setAnalytics(a);
        setFunnel(f);
        setRevenue(r);
        setTimeseries(ts);
        setLeads(l);
        setAccount(acc);
        setCampaigns(c);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        setDataLoadError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate, reloadCount]);

  async function handleConnectInstagram() {
    if (!tenantId) return;
    setConnecting(true);
    setError(null);
    try {
      const { url } = await api.startInstagramConnect(tenantId);
      window.location.href = url;
    } catch (err) {
      setConnecting(false);
      setError(err instanceof Error ? err.message : "Couldn't start the Instagram connection");
    }
  }

  if (!tenantId) return null;

  // Funnel is the canonical all-lead snapshot. Do not derive stage totals from
  // the paginated Leads response, otherwise Overview can silently undercount.
  const stageCounts = funnel
    ? funnel.stages.reduce(
        (acc, stage) => {
          const match = PIPELINE_STAGES.find((pipelineStage) => pipelineStage.value === stage.key);
          if (match) acc[match.value] = stage.count;
          return acc;
        },
        Object.fromEntries(PIPELINE_STAGES.map((s) => [s.value, 0])) as Record<PipelineStage, number>,
      )
    : undefined;
  const categorizedLeadCount = stageCounts ? Object.values(stageCounts).reduce((total, count) => total + count, 0) : 0;
  const uncategorizedLeadCount = funnel
    ? Math.max(0, (analytics?.uniqueLeads ?? categorizedLeadCount) - categorizedLeadCount)
    : 0;
  const totalLeadCount = analytics?.uniqueLeads ?? categorizedLeadCount;
  const qualifiedCount = funnel?.stages.find((s) => s.key === "qualified")?.count ?? 0;
  const meetingCount = funnel?.stages.find((s) => s.key === "meeting")?.count ?? 0;
  const recentLeads = leads?.slice(0, 5) ?? [];
  const stageRows = stageCounts
    ? PIPELINE_STAGES.map((stage) => ({ ...stage, count: stageCounts[stage.value] ?? 0 })).filter((stage) => stage.count > 0)
    : [];
  const maxStageCount = Math.max(1, ...stageRows.map((stage) => stage.count));

  // Reporting period: a real filter, not a decorative one — it slices the
  // actual timeseries and lead-creation dates this page already has, rather
  // than only swapping a caption.
  const cutoff = periodStart(period);
  const sparseTimeseries = timeseries?.filter((point) => !cutoff || new Date(point.date) >= cutoff) ?? null;
  const filteredTimeseries = sparseTimeseries && cutoff ? fillDailySeries(sparseTimeseries, cutoff, new Date()) : sparseTimeseries;
  const newLeadsInPeriod = leads?.filter((lead) => !cutoff || new Date(lead.createdAt) >= cutoff).length ?? null;

  // "Needs your attention" — each count is real, drawn from data this page
  // already fetches (plus a dedicated campaigns fetch for the draft count),
  // not the preview's fixed sample copy.
  const needsReviewCount = leads?.filter((lead) => lead.handoffStatus === "requested").length ?? 0;
  const unassignedLeadCount = leads?.filter((lead) => lead.ownerUserId === null).length ?? 0;
  const draftCampaignCount = campaigns?.filter((c) => !c.published).length ?? 0;
  const accountHealthNote =
    account === null
      ? "Loading…"
      : !account.connected
        ? "Instagram isn't connected yet"
        : account.status === "error"
          ? (account.lastError ?? "This account needs attention")
          : "Review permissions and last event";

  const nextActions = [
    {
      to: `/dashboard/${tenantId}/inbox`,
      title: "Review conversations",
      description:
        leads === null
          ? "Loading…"
          : `${needsReviewCount} conversation${needsReviewCount === 1 ? "" : "s"} need${needsReviewCount === 1 ? "s" : ""} a human review`,
    },
    {
      to: `/dashboard/${tenantId}/leads`,
      title: "Assign lead owners",
      description:
        leads === null
          ? "Loading…"
          : `${unassignedLeadCount} lead${unassignedLeadCount === 1 ? "" : "s"} ${unassignedLeadCount === 1 ? "is" : "are"} unassigned`,
    },
    {
      to: `/dashboard/${tenantId}/automation`,
      title: "Finish an automation draft",
      description:
        campaigns === null
          ? "Loading…"
          : campaigns.length === 0
            ? "No automations yet"
            : draftCampaignCount > 0
              ? `${draftCampaignCount} draft${draftCampaignCount === 1 ? "" : "s"} not live`
              : "All automations are live",
    },
    {
      to: `/dashboard/${tenantId}/integrations`,
      title: "Check account health",
      description: accountHealthNote,
    },
  ];

  return (
    <div className="page page-wide page-overview">
      <header className="overview-header">
        <div>
          <h1>Overview</h1>
          <p className="muted">A clear view of what needs attention across your Instagram operations.</p>
        </div>
      </header>

      <div className="overview-toolbar">
        {account?.connected && <span className="pill pill-ok"><span className="mr-1">●</span>Instagram connected</span>}
        <label className="overview-period-select">
          <span className="sr-only">Reporting period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as ReportingPeriod)}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {dataLoadError && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{dataLoadError}</span>
          <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>Retry loading dashboard</button>
        </div>
      )}
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      {justConnected && (
        <div className="banner banner-ok">
          Instagram connected. <button type="button" className="link-button" onClick={() => setSearchParams({}, { replace: true })}>Dismiss</button>
        </div>
      )}

      {account !== null && !account.connected && (
        <section className="card overview-connect-card">
          <div>
            <h2>Connect Instagram</h2>
            <p className="muted">Connect your Instagram Business account to start replying to comments and DMs automatically.</p>
          </div>
          <button className="btn-primary" onClick={handleConnectInstagram} disabled={connecting}>
            {connecting ? "Redirecting to Instagram…" : "Connect Instagram"}
          </button>
        </section>
      )}

      <section className="overview-metrics" aria-label="Lead metrics">
        <Metric label="New leads" value={newLeadsInPeriod !== null ? newLeadsInPeriod.toLocaleString() : "—"} note={PERIOD_NOTE[period]} />
        <Metric label="Qualified leads" value={funnel ? qualifiedCount.toLocaleString() : "—"} note="current pipeline" />
        <Metric label="Meetings scheduled" value={funnel ? meetingCount.toLocaleString() : "—"} note="current pipeline" />
        <Metric label="Revenue" value={revenue ? formatMoney(revenue) : "—"} note={revenue?.length ? "won deals" : "No won revenue recorded"} />
      </section>

      <div className="overview-grid">
        <section className="card overview-panel">
          <header className="overview-panel-header">
            <div>
              <span className="overview-eyebrow">Conversation volume</span>
              <h2>Activity over time</h2>
              <p className="muted">Count of inbound comments and DMs. Not a conversion rate.</p>
            </div>
            <Link to={`/dashboard/${tenantId}/analytics`}>Open analytics →</Link>
          </header>
          {filteredTimeseries === null ? (
            <p className="muted">{dataLoadError ? "Conversation data is unavailable." : "Loading…"}</p>
          ) : (
            <ConversationsChart data={filteredTimeseries} />
          )}
        </section>

        <section className="card overview-panel">
          <header className="overview-panel-header">
            <div>
              <span className="overview-eyebrow">Lead pipeline</span>
              <h2>{totalLeadCount.toLocaleString()} leads by stage</h2>
              <p className="muted">Unique lead records; totals reconcile.</p>
            </div>
            <Link to={`/dashboard/${tenantId}/leads`}>View leads →</Link>
          </header>
          {stageCounts === undefined ? (
            <p className="muted">{dataLoadError ? "Lead stage data is unavailable." : "Loading…"}</p>
          ) : (
            <>
              <div className="overview-stage-list">
                {stageRows.map((stage) => {
                  const percentage = totalLeadCount > 0 ? Math.round((stage.count / totalLeadCount) * 100) : 0;
                  return (
                    <div className="overview-stage-row" key={stage.value}>
                      <span>{stage.label}</span>
                      <div className="overview-stage-track" aria-hidden="true"><span style={{ width: `${(stage.count / maxStageCount) * 100}%` }} /></div>
                      <strong>{stage.count.toLocaleString()}</strong>
                      <span className="overview-stage-percent">{percentage}%</span>
                    </div>
                  );
                })}
                {uncategorizedLeadCount > 0 && (
                  <div className="overview-stage-row overview-stage-row-muted">
                    <span>Uncategorized</span>
                    <div className="overview-stage-track" aria-hidden="true"><span style={{ width: `${(uncategorizedLeadCount / Math.max(maxStageCount, uncategorizedLeadCount)) * 100}%` }} /></div>
                    <strong>{uncategorizedLeadCount.toLocaleString()}</strong>
                    <span className="overview-stage-percent">{totalLeadCount ? Math.round((uncategorizedLeadCount / totalLeadCount) * 100) : 0}%</span>
                  </div>
                )}
              </div>
              {uncategorizedLeadCount > 0 ? (
                <p className="overview-reconcile">{uncategorizedLeadCount} lead{uncategorizedLeadCount === 1 ? " is" : "s are"} not mapped to a known pipeline stage.</p>
              ) : totalLeadCount > 0 ? (
                <p className="overview-reconcile flex items-center gap-1.5 text-ok-ink">
                  <CheckCircleIcon className="h-4 w-4 shrink-0" />
                  {stageRows.map((stage) => stage.count).join(" + ")} = {totalLeadCount} leads; no unclassified leads.
                </p>
              ) : null}
            </>
          )}
        </section>

        <section className="card overview-panel">
          <header className="overview-panel-header">
            <div>
              <span className="overview-eyebrow">Next actions</span>
              <h2>Needs your attention</h2>
              <p className="muted">Tasks that need an operator.</p>
            </div>
            <StatusBadge tone="warning">{nextActions.length} Items</StatusBadge>
          </header>
          <div className="overview-actions">
            {nextActions.map((action, index) => (
              <Link key={action.title} to={action.to}>
                <span className="overview-action-number">{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{action.title}</strong><small>{action.description}</small></span>
                <span>→</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="card overview-panel">
          <header className="overview-panel-header">
            <div>
              <span className="overview-eyebrow">Recent conversations</span>
              <h2>Latest activity</h2>
              <p className="muted">Recent lead activity from the connected workspace.</p>
            </div>
            <Link to={`/dashboard/${tenantId}/inbox`}>Open inbox →</Link>
          </header>
          {leads === null ? (
            <p className="muted">{dataLoadError ? "Recent conversations are unavailable." : "Loading…"}</p>
          ) : recentLeads.length === 0 ? (
            <p className="muted">No leads yet.</p>
          ) : (
            <ul className="list overview-recent-list">
              {recentLeads.map((lead) => {
                const name = leadDisplayName(lead.username);
                const stage = PIPELINE_STAGES.find((s) => s.value === lead.pipelineStage);
                return (
                  <li key={lead.id} className="list-item">
                    <Link to={`/dashboard/${tenantId}/leads/${lead.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-inherit no-underline">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-sm font-semibold text-accent">{name.charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{name}</span>
                        <span className="block truncate text-xs text-subtle">{lead.lastMessagePreview ?? "No messages yet"}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs text-subtle">{formatRelativeTime(lead.lastInboundAt)}</span>
                        <span className="pill mt-1 inline-block">{stage?.label ?? lead.pipelineStage}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <button type="button" className="overview-definitions-link" onClick={() => setDefinitionsOpen((open) => !open)}>
        {definitionsOpen ? "Hide metric definitions ↑" : "How are these metrics counted? ↓"}
      </button>
      {definitionsOpen && (
        <div className="overview-definitions">
          <strong>Metric definitions</strong>
          <p>Lead metrics count unique lead records. Activity counts conversation events, so one person can create multiple comments or DMs. Revenue only reflects recorded won deals.</p>
        </div>
      )}
    </div>
  );
}
