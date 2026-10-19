import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type ConversationsTimeseriesPoint, type Funnel, type RevenueByCurrency, type TopKeyword, type TopPost } from "../api";
import { ErrorState, LoadingState } from "../components/ui";
import { useTenant } from "../context/TenantContext";

type AnalyticsTab = "activity" | "conversion";

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

function formatMoney(currency: string | undefined, total: number): string {
  const normalizedCurrency = currency ?? "Unknown currency";
  const symbol = CURRENCY_SYMBOL[normalizedCurrency];
  const amount = total.toLocaleString();
  return symbol ? `${symbol}${amount}` : `${normalizedCurrency} ${amount}`;
}

function getStageCount(funnel: Funnel, key: string): number {
  return funnel.stages.find((stage) => stage.key === key)?.count ?? 0;
}

function ActivityVolume({ points }: { points: ConversationsTimeseriesPoint[] }) {
  const maxCount = Math.max(1, ...points.map((point) => point.comments + point.dms));
  return (
    <div className="analytics-activity">
      <div className="analytics-section-heading">
        <div>
          <span className="overview-eyebrow">Inbound activity</span>
          <h2>Activity over the last 30 days</h2>
          <p className="muted">Daily inbound comments and DM send reservations. One person can generate multiple events; this is activity volume, not a conversion rate.</p>
        </div>
      </div>
      <div className="analytics-bars" aria-label="Daily activity volume for the last 30 days">
        {points.map((point) => {
          const total = point.comments + point.dms;
          const label = new Date(`${point.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <div className="analytics-bar-item" key={point.date} title={`${label}: ${point.comments} comments, ${point.dms} DMs`}>
              <strong>{total.toLocaleString()}</strong>
              <div className="analytics-bar-track"><span style={{ height: `${Math.max(total > 0 ? 8 : 2, (total / maxCount) * 100)}%` }} /></div>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      <div className="analytics-legend" aria-label="Activity totals">
        <span><strong>{points.reduce((sum, point) => sum + point.comments, 0).toLocaleString()}</strong> comments</span>
        <span><strong>{points.reduce((sum, point) => sum + point.dms, 0).toLocaleString()}</strong> DMs</span>
      </div>
    </div>
  );
}

function PipelineProgression({ funnel }: { funnel: Funnel }) {
  const stages = funnel.stages.filter((stage) => !["comments", "dms"].includes(stage.key));
  const leadCount = stages.find((stage) => stage.key === "leads")?.count ?? 0;
  return (
    <div>
      <div className="analytics-section-heading">
        <div>
          <span className="overview-eyebrow">Pipeline</span>
          <h2>Current pipeline progression</h2>
          <p className="muted">Current lead state, not a historical conversion cohort. Percentages use all leads as the denominator.</p>
        </div>
      </div>
      <div className="analytics-pipeline-list">
        {stages.map((stage) => {
          const pct = leadCount > 0 ? Math.round((stage.count / leadCount) * 100) : 0;
          return (
            <div key={`${stage.key}-${stage.count}`} className="analytics-pipeline-row">
              <div className="analytics-pipeline-label"><span>{stage.label}</span><strong>{stage.count.toLocaleString()} <small>({pct}%)</small></strong></div>
              <div className="analytics-pipeline-track"><span style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
      <div className="analytics-table-scroll">
        <table className="table">
          <caption className="sr-only">Current pipeline counts and share of all leads</caption>
          <thead><tr><th>Pipeline stage</th><th>Leads</th><th>Share of leads</th></tr></thead>
          <tbody>{stages.map((stage) => <tr key={`${stage.key}-table`}><td>{stage.label}</td><td className="tabular-nums">{stage.count.toLocaleString()}</td><td className="tabular-nums">{leadCount > 0 ? Math.round((stage.count / leadCount) * 100) : 0}%</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function TopPosts({ tenantId, posts, keywords, error }: { tenantId: string; posts: TopPost[] | null; keywords: TopKeyword[] | null; error: string | null }) {
  return (
    <section className="card analytics-supporting-panel">
      <div className="analytics-section-heading">
        <div>
          <span className="overview-eyebrow">Content signals</span>
          <h2>Top performing posts</h2>
          <p className="muted">Posts that generated the most inbound comments. Linking a comment to a lead is an event association, not conversion attribution.</p>
        </div>
      </div>
      {error ? (
        <ErrorState title="Top post signals unavailable" description={error} />
      ) : posts === null ? (
        <LoadingState label="Loading post signals" className="min-h-24 py-5" />
      ) : posts.length === 0 ? (
        <p className="muted">No commented posts yet.</p>
      ) : (
        <div className="analytics-table-scroll">
          <table className="table">
            <thead><tr><th>Post</th><th>Comments</th><th>Next step</th></tr></thead>
            <tbody>{posts.map((post, index) => {
              const postId = String(post.mediaId ?? `post-${index + 1}`);
              const title = String(post.caption ?? postId);
              return <tr key={postId}><td>{post.permalink ? <a href={post.permalink} target="_blank" rel="noreferrer">{title}</a> : title}</td><td className="tabular-nums">{post.commentCount}</td><td><Link className="link-button" to={`/dashboard/${tenantId}/leads?sourceMediaId=${encodeURIComponent(postId)}`}>Review linked leads →</Link></td></tr>;
            })}</tbody>
          </table>
        </div>
      )}
      {keywords === null ? <p className="muted small mt-3">Trigger keywords are unavailable right now.</p> : keywords.length > 0 && <div className="analytics-keywords"><h3>Top trigger keywords</h3><div>{keywords.map((keyword, index) => <span className="tag-chip" key={`${keyword.keyword}-${index}`}>{keyword.keyword} ({keyword.matchCount})</span>)}</div></div>}
    </section>
  );
}

export function AnalyticsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { selectedAccountId } = useTenant();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("activity");
  const [showMetricDefinitions, setShowMetricDefinitions] = useState(false);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [revenue, setRevenue] = useState<RevenueByCurrency[] | null>(null);
  const [timeseries, setTimeseries] = useState<ConversationsTimeseriesPoint[] | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[] | null>(null);
  const [topKeywords, setTopKeywords] = useState<TopKeyword[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);
  const [topPostsError, setTopPostsError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    const currentTenantId: string = tenantId;
    let cancelled = false;
    async function load() {
      setFunnel(null);
      setRevenue(null);
      setTimeseries(null);
      setTopPosts(null);
      setTopKeywords(null);
      setErrors([]);
      setTimeseriesError(null);
      setTopPostsError(null);
      const results = await Promise.allSettled([
        api.getFunnel(currentTenantId, selectedAccountId),
        api.getRevenue(currentTenantId, selectedAccountId),
        api.getConversationsTimeseries(currentTenantId, selectedAccountId),
        api.getTopPosts(currentTenantId, selectedAccountId),
        api.getTopKeywords(currentTenantId, selectedAccountId),
      ]);
      if (cancelled) return;
      if (results.some((result) => result.status === "rejected" && result.reason instanceof ApiError && result.reason.status === 401)) {
        navigate("/login", { replace: true });
        return;
      }
      const nextErrors: string[] = [];
      const [funnelResult, revenueResult, timeseriesResult, postsResult, keywordsResult] = results;
      if (funnelResult.status === "fulfilled") setFunnel(funnelResult.value); else nextErrors.push("Pipeline analytics could not be loaded.");
      if (revenueResult.status === "fulfilled") setRevenue(revenueResult.value); else nextErrors.push("Revenue analytics could not be loaded.");
      if (timeseriesResult.status === "fulfilled") setTimeseries(timeseriesResult.value); else {
        const message = timeseriesResult.reason instanceof Error ? timeseriesResult.reason.message : "The activity history request failed.";
        setTimeseriesError(message);
        nextErrors.push("Activity history could not be loaded.");
      }
      if (postsResult.status === "fulfilled") setTopPosts(postsResult.value); else {
        const message = postsResult.reason instanceof Error ? postsResult.reason.message : "The top post request failed.";
        setTopPostsError(message);
        nextErrors.push("Top post signals could not be loaded.");
      }
      if (keywordsResult.status === "fulfilled") setTopKeywords(keywordsResult.value); else nextErrors.push("Trigger keyword signals could not be loaded.");
      setErrors(nextErrors);
    }
    void load();
    return () => { cancelled = true; };
  }, [tenantId, navigate, reloadCount, selectedAccountId]);

  if (!tenantId) return null;

  const leadCount = funnel ? getStageCount(funnel, "leads") : null;
  const wonCount = funnel ? getStageCount(funnel, "won") : null;
  const commentsCount = funnel ? getStageCount(funnel, "comments") : null;
  const dmsCount = funnel ? getStageCount(funnel, "dms") : null;
  const retry = () => setReloadCount((count) => count + 1);

  return (
    <div className="page page-wide page-analytics">
      <header className="analytics-header">
        <div><span className="overview-eyebrow">Performance</span><h1>Analytics</h1><p className="muted">Understand activity volume separately from lead conversion and current pipeline stages.</p></div>
        <span className="analytics-period-note">Last 30 days for activity · current pipeline state</span>
      </header>

      {errors.length > 0 && <div className="banner banner-error flex flex-wrap items-start justify-between gap-3" role="alert"><div><strong>Some analytics could not be loaded.</strong><ul className="m-0 mt-1 pl-5">{errors.map((item) => <li key={item}>{item}</li>)}</ul></div><button type="button" className="link-button" onClick={retry}>Retry</button></div>}

      <div className="analytics-tabs" role="tablist" aria-label="Analytics views">
        <button type="button" role="tab" aria-selected={activeTab === "activity"} className={activeTab === "activity" ? "analytics-tab is-active" : "analytics-tab"} onClick={() => setActiveTab("activity")}>Activity volume</button>
        <button type="button" role="tab" aria-selected={activeTab === "conversion"} className={activeTab === "conversion" ? "analytics-tab is-active" : "analytics-tab"} onClick={() => setActiveTab("conversion")}>Lead conversion</button>
      </div>

      <div className="analytics-metrics">
        <div><span>Comments received</span><strong>{commentsCount === null ? "—" : commentsCount.toLocaleString()}</strong><small>Inbound comment events</small></div>
        <div><span>Direct messages</span><strong>{dmsCount === null ? "—" : dmsCount.toLocaleString()}</strong><small>Inbound DM reservations</small></div>
        <div><span>Leads</span><strong>{leadCount === null ? "—" : leadCount.toLocaleString()}</strong><small>Current pipeline</small></div>
        <div><span>Won</span><strong>{wonCount === null ? "—" : wonCount.toLocaleString()}</strong><small>Current won stage</small></div>
      </div>
      <div className="mt-3">
        <button type="button" className="link-button" onClick={() => setShowMetricDefinitions((open) => !open)} aria-expanded={showMetricDefinitions}>
          {showMetricDefinitions ? "Hide metric definitions ↑" : "How are these metrics counted? ↓"}
        </button>
        {showMetricDefinitions && (
          <div className="banner mt-2" role="note">
            <strong>Metric definitions</strong>
            <p className="muted m-0 mt-1">Comments and DMs are inbound activity events. Leads and won are current pipeline stages, not historical conversion counts. Activity volume is not a lead conversion rate.</p>
          </div>
        )}
      </div>

      {activeTab === "activity" ? (
        <>
          <section className="card analytics-primary-panel">
            {timeseriesError ? <ErrorState title="Activity history unavailable" description={timeseriesError} action={<button type="button" className="btn-primary btn-small" onClick={retry}>Retry</button>} /> : timeseries === null ? <LoadingState label="Loading activity" description="Fetching real conversation activity for the workspace." /> : <ActivityVolume points={timeseries} />}
          </section>
          <TopPosts tenantId={tenantId} posts={topPosts} keywords={topKeywords} error={topPostsError} />
        </>
      ) : (
        funnel === null ? (
          <section className="card"><ErrorState title="Pipeline analytics unavailable" description="The current lead pipeline could not be loaded. No estimated or sample values are shown." action={<button type="button" className="btn-primary btn-small" onClick={retry}>Retry</button>} /></section>
        ) : (
          <>
            <section className="card analytics-primary-panel">
              <div className="mb-3 flex flex-wrap items-start justify-end gap-3"><Link className="btn-secondary btn-small" to={`/dashboard/${tenantId}/leads`}>View leads</Link></div>
              <PipelineProgression funnel={funnel} />
              {funnel.unmappedLeadCount > 0 && <div className="banner mt-4" role="status"><strong>{funnel.unmappedLeadCount.toLocaleString()} leads have an unrecognized stage.</strong><p className="muted small m-0 mt-1">They remain included in total leads but are not assigned to a known pipeline stage.</p><Link className="link-button inline-block mt-2" to={`/dashboard/${tenantId}/leads`}>Review lead records</Link></div>}
            </section>
            <div className="stat-grid analytics-revenue-grid">
              <div className="stat"><div className="stat-value">{funnel.openWithNoOutcome.toLocaleString()}</div><div className="stat-label">Leads with no final outcome</div></div>
              {revenue === null ? <div className="stat"><div className="stat-value">—</div><div className="stat-label">Revenue unavailable</div></div> : revenue.length === 0 ? <div className="stat"><div className="stat-value">—</div><div className="stat-label">Revenue (no won deals yet)</div></div> : revenue.map((item, index) => <div className="stat" key={`${item.currency ?? "currency"}-${index}`}><div className="stat-value">{formatMoney(item.currency, item.total)}</div><div className="stat-label">Revenue ({item.currency ?? "unknown"}, won deals)</div></div>)}
            </div>
          </>
        )
      )}
    </div>
  );
}
