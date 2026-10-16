import { useEffect, useState, type ComponentType } from "react";
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
import { LeadsByStageDonut } from "../components/LeadsByStageDonut";
import { InboxIcon, LeadsIcon, CalendarIcon, RevenueIcon } from "../components/icons";
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

function StatCard({ icon: Icon, value, label }: { icon: ComponentType<{ className?: string }>; value: string; label: string }) {
  return (
    <div className="card mb-0 flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-2xl font-bold text-ink">{value}</div>
        <div className="truncate text-sm text-subtle">{label}</div>
      </div>
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

  // The funnel endpoint is the canonical all-lead snapshot. The Leads page is
  // paginated, so deriving Overview totals from its first page can undercount
  // stages (for example 20 visible leads versus 24 total leads).
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
  const categorizedLeadCount = stageCounts
    ? Object.values(stageCounts).reduce((total, count) => total + count, 0)
    : 0;
  const uncategorizedLeadCount = funnel ? Math.max(0, (analytics?.uniqueLeads ?? categorizedLeadCount) - categorizedLeadCount) : 0;

  const qualifiedCount = funnel?.stages.find((s) => s.key === "qualified")?.count ?? 0;
  const meetingCount = funnel?.stages.find((s) => s.key === "meeting")?.count ?? 0;
  const recentLeads = leads?.slice(0, 5) ?? [];

  return (
    <div className="page page-wide">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0">
            {greetingForHour(new Date().getHours())}, {deriveDisplayName(session?.email)} 👋
          </h1>
          <p className="muted mt-1">
            {tenant?.name ? `${tenant.name} — h` : "H"}ere's what's happening with your Instagram leads.
          </p>
        </div>
        {account?.connected && (
          <span className="pill pill-ok">
            <span className="mr-1">●</span>Instagram connected
          </span>
        )}
      </div>

      {dataLoadError && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{dataLoadError}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => setReloadCount((count) => count + 1)}
          >
            Retry loading dashboard
          </button>
        </div>
      )}
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      {justConnected && (
        <div className="banner banner-ok">
          Instagram connected.{" "}
          <button type="button" className="link-button" onClick={() => setSearchParams({}, { replace: true })}>
            Dismiss
          </button>
        </div>
      )}

      {account !== null && !account.connected && (
        <div className="card" style={{ borderColor: "var(--accent-soft)" }}>
          <h2>Connect Instagram</h2>
          <p className="muted">Connect your Instagram Business account to start replying to comments and DMs automatically.</p>
          <button className="btn-primary" onClick={handleConnectInstagram} disabled={connecting}>
            {connecting ? "Redirecting to Instagram…" : "Connect Instagram"}
          </button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={LeadsIcon} value={analytics ? analytics.uniqueLeads.toLocaleString() : "—"} label="New leads" />
        <StatCard icon={InboxIcon} value={funnel ? qualifiedCount.toLocaleString() : "—"} label="Qualified leads" />
        <StatCard icon={CalendarIcon} value={funnel ? meetingCount.toLocaleString() : "—"} label="Meetings scheduled" />
        <StatCard icon={RevenueIcon} value={revenue ? formatMoney(revenue) : "—"} label="Revenue (won)" />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card mb-0">
          <h2>Conversations over time</h2>
          {timeseries === null ? (
            <p className="muted">{dataLoadError ? "Conversation data is unavailable." : "Loading…"}</p>
          ) : (
            <ConversationsChart data={timeseries} />
          )}
        </section>

        <section className="card mb-0">
          <h2>Leads by stage</h2>
          {stageCounts === undefined ? (
            <p className="muted">{dataLoadError ? "Lead stage data is unavailable." : "Loading…"}</p>
          ) : (
            <>
              <LeadsByStageDonut counts={stageCounts} uncategorized={uncategorizedLeadCount} />
              {uncategorizedLeadCount > 0 && (
                <p className="muted small mt-3 mb-0">
                  {uncategorizedLeadCount} lead{uncategorizedLeadCount === 1 ? " is" : "s are"} not mapped to a known pipeline stage.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <section className="card">
        <div className="dashboard-header" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: 0 }}>Recent conversations</h2>
          <Link to={`/dashboard/${tenantId}/inbox`}>View inbox →</Link>
        </div>
        {leads === null ? (
          <p className="muted">{dataLoadError ? "Recent conversations are unavailable." : "Loading…"}</p>
        ) : recentLeads.length === 0 ? (
          <p className="muted">No leads yet.</p>
        ) : (
          <ul className="list">
            {recentLeads.map((lead) => {
              const name = leadDisplayName(lead.username);
              const stage = PIPELINE_STAGES.find((s) => s.value === lead.pipelineStage);
              return (
                <li key={lead.id} className="list-item">
                  <Link
                    to={`/dashboard/${tenantId}/leads/${lead.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-inherit no-underline"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-sm font-semibold text-accent">
                      {name.charAt(0).toUpperCase()}
                    </span>
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
  );
}
