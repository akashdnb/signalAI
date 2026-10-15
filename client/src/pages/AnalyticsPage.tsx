import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type Funnel, type RevenueByCurrency, type TopKeyword, type TopPost } from "../api";

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

type AnalyticsTab = "activity" | "conversion";

function formatMoney(currency: string, total: number): string {
  const symbol = CURRENCY_SYMBOL[currency];
  const amount = total.toLocaleString();
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
}

function getStageCount(funnel: Funnel, key: string): number {
  return funnel.stages.find((stage) => stage.key === key)?.count ?? 0;
}

function ActivityVolume({ funnel }: { funnel: Funnel }) {
  const activity = funnel.stages.filter((stage) => stage.key === "comments" || stage.key === "dms");
  const maxCount = Math.max(1, ...activity.map((stage) => stage.count));

  return (
    <div className="analytics-activity">
      <div className="analytics-section-heading">
        <div>
          <span className="overview-eyebrow">Inbound activity</span>
          <h2>Messages and comments</h2>
          <p className="muted">Total events recorded. Comments and DMs can include repeated activity from the same person, so these are not conversion rates.</p>
        </div>
      </div>
      <div className="analytics-bars" aria-label="Activity volume by event type">
        {activity.map((stage) => (
          <div className="analytics-bar-item" key={stage.key}>
            <strong>{stage.count.toLocaleString()}</strong>
            <div className="analytics-bar-track"><span style={{ height: `${Math.max(8, (stage.count / maxCount) * 100)}%` }} /></div>
            <span>{stage.label}</span>
          </div>
        ))}
      </div>
      <div className="analytics-table-scroll">
        <table className="table">
          <caption className="sr-only">Activity event definitions</caption>
          <thead><tr><th>Event type</th><th>Count</th><th>Definition</th></tr></thead>
          <tbody>{activity.map((stage) => (
            <tr key={stage.key}>
              <td>{stage.label}</td>
              <td className="tabular-nums">{stage.count.toLocaleString()}</td>
              <td>{stage.key === "comments" ? "Inbound comment events" : "Inbound DM events, including repeats"}</td>
            </tr>
          ))}</tbody>
        </table>
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
          <p className="muted">Current snapshot, not a historical cohort. Percentages use all leads as the denominator.</p>
        </div>
      </div>
      <div className="space-y-4">
        {stages.map((stage) => {
          const pct = leadCount > 0 ? Math.round((stage.count / leadCount) * 100) : 0;
          return (
            <div key={stage.key} className="analytics-pipeline-row">
              <div className="analytics-pipeline-label"><span>{stage.label}</span><strong>{stage.count.toLocaleString()} <small>({pct}%)</small></strong></div>
              <div className="analytics-pipeline-track"><span style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
      <div className="analytics-table-scroll">
        <table className="table">
          <caption className="sr-only">Current pipeline counts and share of all leads at or beyond each stage</caption>
          <thead><tr><th>Pipeline stage</th><th>Leads</th><th>Share of leads</th></tr></thead>
          <tbody>{stages.map((stage) => (
            <tr key={stage.key}><td>{stage.label}</td><td className="tabular-nums">{stage.count.toLocaleString()}</td><td className="tabular-nums">{leadCount > 0 ? Math.round((stage.count / leadCount) * 100) : 0}%</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function TopPosts({ posts, keywords }: { posts: TopPost[] | null; keywords: TopKeyword[] | null }) {
  return (
    <section className="card analytics-supporting-panel">
      <div className="analytics-section-heading"><div><span className="overview-eyebrow">Content signals</span><h2>Top performing posts</h2><p className="muted">Posts that generated the most inbound comments.</p></div></div>
      {posts === null ? <p className="muted">Loading…</p> : posts.length === 0 ? <p className="muted">No comments yet.</p> : <div className="analytics-table-scroll"><table className="table"><thead><tr><th>Post</th><th>Comments</th></tr></thead><tbody>{posts.map((post) => <tr key={post.mediaId}><td>{post.permalink ? <a href={post.permalink} target="_blank" rel="noreferrer">{post.caption ?? post.mediaId}</a> : post.caption ?? post.mediaId}</td><td className="tabular-nums">{post.commentCount}</td></tr>)}</tbody></table></div>}
      {keywords && keywords.length > 0 && <div className="analytics-keywords"><h3>Top trigger keywords</h3><div>{keywords.map((keyword) => <span className="tag-chip" key={keyword.keyword}>{keyword.keyword} ({keyword.matchCount})</span>)}</div></div>}
    </section>
  );
}

export function AnalyticsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("activity");
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [revenue, setRevenue] = useState<RevenueByCurrency[] | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[] | null>(null);
  const [topKeywords, setTopKeywords] = useState<TopKeyword[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      try {
        const [f, r, posts, keywords] = await Promise.all([
          api.getFunnel(tenantId), api.getRevenue(tenantId), api.getTopPosts(tenantId), api.getTopKeywords(tenantId),
        ]);
        if (cancelled) return;
        setFunnel(f); setRevenue(r); setTopPosts(posts); setTopKeywords(keywords); setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) { navigate("/login", { replace: true }); return; }
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tenantId, navigate, reloadCount]);

  if (!tenantId) return null;

  const leadCount = funnel ? getStageCount(funnel, "leads") : 0;
  const wonCount = funnel ? getStageCount(funnel, "won") : 0;
  const commentsCount = funnel ? getStageCount(funnel, "comments") : 0;
  const dmsCount = funnel ? getStageCount(funnel, "dms") : 0;

  return (
    <div className="page page-wide page-analytics">
      <div className="analytics-header"><div><span className="overview-eyebrow">Performance</span><h1>Analytics</h1><p className="muted">Understand activity volume separately from lead conversion and current pipeline stages.</p></div></div>
      {error && <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert"><span>{error}</span>{funnel === null && <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button>}</div>}
      {funnel === null ? <section className="card"><p className="muted" role="status">{error ? "Analytics could not be loaded." : "Loading analytics…"}</p></section> : <>
        <div className="analytics-tabs" role="tablist" aria-label="Analytics views">
          <button type="button" role="tab" aria-selected={activeTab === "activity"} className={activeTab === "activity" ? "analytics-tab is-active" : "analytics-tab"} onClick={() => setActiveTab("activity")}>Activity volume</button>
          <button type="button" role="tab" aria-selected={activeTab === "conversion"} className={activeTab === "conversion" ? "analytics-tab is-active" : "analytics-tab"} onClick={() => setActiveTab("conversion")}>Lead conversion</button>
          <span className="analytics-period-note">Workspace-wide current data</span>
        </div>
        <div className="analytics-metrics">
          <div><span>Comments received</span><strong>{commentsCount.toLocaleString()}</strong><small>Inbound comment events</small></div>
          <div><span>Direct messages</span><strong>{dmsCount.toLocaleString()}</strong><small>Inbound DM events</small></div>
          <div><span>Leads</span><strong>{leadCount.toLocaleString()}</strong><small>Current pipeline</small></div>
          <div><span>Won</span><strong>{wonCount.toLocaleString()}</strong><small>Current won stage</small></div>
        </div>
        {activeTab === "activity" ? <>
          <section className="card analytics-primary-panel"><ActivityVolume funnel={funnel} /></section>
          <TopPosts posts={topPosts} keywords={topKeywords} />
        </> : <>
          <section className="card analytics-primary-panel"><PipelineProgression funnel={funnel} /></section>
          <div className="stat-grid analytics-revenue-grid">
            <div className="stat"><div className="stat-value">{funnel.openWithNoOutcome.toLocaleString()}</div><div className="stat-label">Leads with no final outcome</div></div>
            {revenue === null ? <div className="stat"><div className="stat-value">…</div><div className="stat-label">Revenue</div></div> : revenue.length === 0 ? <div className="stat"><div className="stat-value">—</div><div className="stat-label">Revenue (no won deals yet)</div></div> : revenue.map((item) => <div className="stat" key={item.currency}><div className="stat-value">{formatMoney(item.currency, item.total)}</div><div className="stat-label">Revenue ({item.currency}, won deals)</div></div>)}
          </div>
        </>}
      </>}
    </div>
  );
}
