import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  api,
  loadSession,
  type AccountHealth,
  type Analytics,
  type ConversationsTimeseriesPoint,
  type Funnel,
  type LeadListItem,
  type PipelineStage,
  type RevenueByCurrency,
} from "../api";
import { ConversationsChart } from "../components/ConversationsChart";
import { useTenant } from "../context/TenantContext";
import { PIPELINE_STAGES, deriveDisplayName, formatRelativeTime, leadDisplayName } from "../lib/leadFormatting";

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

function formatMoney(revenue: RevenueByCurrency[]): string {
  if (revenue.length === 0) return "—";
  const [top, ...rest] = revenue;
  const symbol = CURRENCY_SYMBOL[top!.currency];
  const amount = top!.total.toLocaleString();
  const primary = symbol ? `${symbol}${amount}` : `${top!.currency} ${amount}`;
  return rest.length > 0 ? `${primary} +${rest.length} more` : primary;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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
  const { tenant } = useTenant();
  const session = loadSession();

  const [account, setAccount] = useState<AccountHealth | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [revenue, setRevenue] = useState<RevenueByCurrency[] | null>(null);
  const [timeseries, setTimeseries] = useState<ConversationsTimeseriesPoint[] | null>(null);
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [definitionsOpen, setDefinitionsOpen] = useState(false);
  const justConnected = searchParams.get("connected") === "1";

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      setDataLoadError(null);
      try {
        const [a, f, r, ts, l, acc] = await Promise.all([
          api.getAnalytics(tenantId!),
          api.getFunnel(tenantId!),
          api.getRevenue(tenantId!),
          api.getConversationsTimeseries(tenantId!),
          api.getLeads(tenantId!),
          api.getAccountHealth(tenantId!),
        ]);
        if (cancelled) return;
        setAnalytics(a);
        setFunnel(f);
        setRevenue(r);
        setTimeseries(ts);
        setLeads(l);
        setAccount(acc);
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

  return (
    <div className="page page-wide page-overview">
      <header className="overview-header">
        <div>
          <p className="overview-eyebrow">Overview</p>
          <h1>{greetingForHour(new Date().getHours())}, {deriveDisplayName(session?.email)} 👋</h1>
          <p className="muted">{tenant?.name ? `${tenant.name} — ` : ""}Here's what's happening with your Instagram operations.</p>
        </div>
        {account?.connected && <span className="pill pill-ok"><span className="mr-1">●</span>Instagram connected</span>}
      </header>

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
        <Metric label="New leads" value={analytics ? analytics.uniqueLeads.toLocaleString() : "—"} note="current workspace total" />
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
              <p className="muted">Comments and DMs are activity events, not conversion rates.</p>
            </div>
            <Link to={`/dashboard/${tenantId}/analytics`}>Open analytics →</Link>
          </header>
          {timeseries === null ? (
            <p className="muted">{dataLoadError ? "Conversation data is unavailable." : "Loading…"}</p>
          ) : (
            <ConversationsChart data={timeseries} />
          )}
        </section>

        <section className="card overview-panel">
          <header className="overview-panel-header">
            <div>
              <span className="overview-eyebrow">Lead pipeline</span>
              <h2>{totalLeadCount.toLocaleString()} leads by stage</h2>
              <p className="muted">Unique lead records; totals reconcile with the Leads page.</p>
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
              {uncategorizedLeadCount > 0 && <p className="overview-reconcile">{uncategorizedLeadCount} lead{uncategorizedLeadCount === 1 ? " is" : "s are"} not mapped to a known pipeline stage.</p>}
            </>
          )}
        </section>

        <section className="card overview-panel">
          <header className="overview-panel-header">
            <div>
              <span className="overview-eyebrow">Next actions</span>
              <h2>Needs your attention</h2>
              <p className="muted">A short list of useful places to continue.</p>
            </div>
          </header>
          <div className="overview-actions">
            <Link to={`/dashboard/${tenantId}/inbox`}><span><strong>Review conversations</strong><small>Open the latest inbound conversations and handoffs.</small></span><span>→</span></Link>
            <Link to={`/dashboard/${tenantId}/leads`}><span><strong>Review lead ownership</strong><small>Check unassigned or recently active leads.</small></span><span>→</span></Link>
            <Link to={`/dashboard/${tenantId}/analytics`}><span><strong>Review performance</strong><small>Separate activity volume from pipeline progression.</small></span><span>→</span></Link>
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
