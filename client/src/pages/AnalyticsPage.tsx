import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type Funnel, type RevenueByCurrency, type TopKeyword, type TopPost } from "../api";
import { useTenant } from "../context/TenantContext";

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };
type AnalyticsTab = "activity" | "conversion";

function formatMoney(currency: string | undefined, total: number): string {
  const normalizedCurrency = currency ?? "Unknown currency";
  const symbol = CURRENCY_SYMBOL[normalizedCurrency];
  const amount = total.toLocaleString();
  return symbol ? `${symbol}${amount}` : `${normalizedCurrency} ${amount}`;
}

function getStageCount(funnel: Funnel, key: string | undefined): number {
  return funnel.stages.find((stage) => stage.key === key)?.count ?? 0;
}

function ActivityVolume({ funnel }: { funnel: Funnel }) {
  const activity = funnel.stages.filter((stage) => stage.key === "comments" || stage.key === "dms");
  const maxCount = Math.max(1, ...activity.map((stage) => stage.count));
  return (
    <div className="analytics-activity">
      <div className="analytics-section-heading"><div><span className="overview-eyebrow">Inbound activity</span><h2>Messages and comments</h2><p className="muted">All-time activity totals. Comments are inbound comment events; DMs are send reservations, recorded before delivery is attempted. A send can later fail, and one person can generate multiple events, so these are not conversion rates.</p></div></div>
      <div className="analytics-bars" aria-label="Activity volume by event type">
        {activity.map((stage) => <div className="analytics-bar-item" key={`${stage.label ?? "activity"}-${stage.count}`}><strong>{stage.count.toLocaleString()}</strong><div className="analytics-bar-track"><span style={{ height: `${Math.max(8, (stage.count / maxCount) * 100)}%` }} /></div><span>{stage.label ?? "Activity"}</span></div>)}
      </div>
      <div className="analytics-table-scroll"><table className="table"><caption className="sr-only">Activity event definitions</caption><thead><tr><th>Event type</th><th>Count</th><th>Definition</th></tr></thead><tbody>{activity.map((stage) => <tr key={`${stage.label ?? "activity"}-definition`}><td>{stage.label ?? "Activity"}</td><td className="tabular-nums">{stage.count.toLocaleString()}</td><td>{stage.key === "comments" ? "Inbound comment events" : "Inbound DM send reservations, including repeats"}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function PipelineProgression({ funnel }: { funnel: Funnel }) {
  const stages = funnel.stages.filter((stage) => stage.key !== "comments" && stage.key !== "dms");
  const leadCount = stages.find((stage) => stage.key === "leads")?.count ?? 0;
  return (
    <div>
      <div className="analytics-section-heading"><div><span className="overview-eyebrow">Pipeline</span><h2>Current pipeline progression</h2><p className="muted">Current status of all lead records, not a historical conversion cohort. Percentages use all leads as the denominator and show the share currently at or beyond each stage; lost leads are excluded from earlier-stage totals. Activity totals above use a different population.</p></div></div>
      <div className="space-y-4">{stages.map((stage) => { const pct = leadCount > 0 ? Math.round((stage.count / leadCount) * 100) : 0; const label = stage.label ?? "Pipeline stage"; return <div key={`${label}-${stage.count}`} className="analytics-pipeline-row"><div className="analytics-pipeline-label"><span>{label}</span><strong>{stage.count.toLocaleString()} <small>({pct}%)</small></strong></div><div className="analytics-pipeline-track"><span style={{ width: `${pct}%` }} /></div></div>; })}</div>
      <div className="analytics-table-scroll"><table className="table"><caption className="sr-only">Current pipeline counts and share of all leads at or beyond each stage</caption><thead><tr><th>Pipeline stage</th><th>Leads</th><th>Share of leads</th></tr></thead><tbody>{stages.map((stage) => <tr key={`${stage.label ?? "stage"}-table`}><td>{stage.label ?? "Pipeline stage"}</td><td className="tabular-nums">{stage.count.toLocaleString()}</td><td className="tabular-nums">{leadCount > 0 ? Math.round((stage.count / leadCount) * 100) : 0}%</td></tr>)}</tbody></table></div>
    </div>
  );
}

function TopPosts({ tenantId, posts, keywords }: { tenantId: string; posts: TopPost[] | null; keywords: TopKeyword[] | null }) {
  return (
    <section className="card analytics-supporting-panel">
      <div className="analytics-section-heading"><div><span className="overview-eyebrow">Content signals</span><h2>Top performing posts</h2><p className="muted">Posts that generated the most inbound comments. Linking to leads is an event association, not proof of conversion attribution.</p></div></div>
      {posts === null ? <p className="muted">Loading…</p> : posts.length === 0 ? <p className="muted">No comments yet.</p> : <div className="analytics-table-scroll"><table className="table"><thead><tr><th>Post</th><th>Comments</th><th>Next step</th></tr></thead><tbody>{posts.map((post, index) => { const postId = String(post.mediaId ?? `post-${index + 1}`); const postTitle = String(post.caption ?? postId); const permalink = post.permalink ? String(post.permalink) : null; return <tr key={postId}><td>{permalink ? <a href={permalink} target="_blank" rel="noreferrer">{postTitle}</a> : postTitle}</td><td className="tabular-nums">{post.commentCount}</td><td><Link className="link-button" to={`/dashboard/${tenantId}/leads?sourceMediaId=${encodeURIComponent(postId)}`}>View linked leads</Link></td></tr>; })}</tbody></table></div>}
      {keywords === null ? <p className="muted small mt-3">Trigger keywords are unavailable right now.</p> : keywords.length > 0 && <div className="analytics-keywords"><h3>Top trigger keywords</h3><div>{keywords.map((keyword, index) => { const keywordLabel = String(keyword.keyword ?? `Keyword ${index + 1}`); return <span className="tag-chip" key={`${keywordLabel}-${index}`}>{keywordLabel} ({keyword.matchCount})</span>; })}</div></div>}
    </section>
  );
}

export function AnalyticsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("activity");
  const { selectedAccountId } = useTenant();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [revenue, setRevenue] = useState<RevenueByCurrency[] | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[] | null>(null);
  const [topKeywords, setTopKeywords] = useState<TopKeyword[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [reloadCount, setReloadCount] = useState(0);
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      const results = await Promise.allSettled([api.getFunnel(tenantId!, selectedAccountId), api.getRevenue(tenantId!, selectedAccountId), api.getTopPosts(tenantId!, selectedAccountId), api.getTopKeywords(tenantId!, selectedAccountId)]);
      if (cancelled) return;
      const authFailure = results.find((result) => result.status === "rejected" && result.reason instanceof ApiError && result.reason.status === 401);
      if (authFailure) { navigate("/login", { replace: true }); return; }
      const nextErrors: string[] = [];
      const [funnelResult, revenueResult, postsResult, keywordsResult] = results;
      if (funnelResult.status === "fulfilled") setFunnel(funnelResult.value); else nextErrors.push(`Pipeline analytics: ${funnelResult.reason instanceof Error ? funnelResult.reason.message : "unavailable"}`);
      if (revenueResult.status === "fulfilled") setRevenue(revenueResult.value); else nextErrors.push(`Revenue: ${revenueResult.reason instanceof Error ? revenueResult.reason.message : "unavailable"}`);
      if (postsResult.status === "fulfilled") setTopPosts(postsResult.value); else nextErrors.push(`Top posts: ${postsResult.reason instanceof Error ? postsResult.reason.message : "unavailable"}`);
      if (keywordsResult.status === "fulfilled") setTopKeywords(keywordsResult.value); else nextErrors.push(`Trigger keywords: ${keywordsResult.reason instanceof Error ? keywordsResult.reason.message : "unavailable"}`);
      setErrors(nextErrors);
    }
    void load();
    return () => { cancelled = true; };
  }, [tenantId, navigate, reloadCount, selectedAccountId]);
  if (!tenantId) return null;
  const leadCount = funnel ? getStageCount(funnel, "leads") : 0;
  const wonCount = funnel ? getStageCount(funnel, "won") : 0;
  const commentsCount = funnel ? getStageCount(funnel, "comments") : 0;
  const dmsCount = funnel ? getStageCount(funnel, "dms") : 0;

  return (
    <div className="page page-wide page-analytics">
      <div className="analytics-header"><div><span className="overview-eyebrow">Performance</span><h1>Analytics</h1><p className="muted">Understand activity volume separately from lead conversion and current pipeline stages.</p></div></div>
      {errors.length > 0 && <div className="banner banner-error flex flex-wrap items-start justify-between gap-3" role="alert"><div><strong>Some analytics could not be loaded.</strong><ul className="m-0 mt-1 pl-5">{errors.map((item) => <li key={item}>{item}</li>)}</ul></div>{funnel === null && <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button>}</div>}
      {funnel === null ? <section className="card"><p className="muted" role="status">{errors.length > 0 ? "Analytics could not be loaded." : "Loading analytics…"}</p></section> : <>
        <div className="analytics-tabs" role="tablist" aria-label="Analytics views"><button type="button" role="tab" aria-selected={activeTab === "activity"} className={activeTab === "activity" ? "analytics-tab is-active" : "analytics-tab"} onClick={() => setActiveTab("activity")}>Activity volume</button><button type="button" role="tab" aria-selected={activeTab === "conversion"} className={activeTab === "conversion" ? "analytics-tab is-active" : "analytics-tab"} onClick={() => setActiveTab("conversion")}>Lead conversion</button><span className="analytics-period-note">Workspace-wide current data</span></div>
        <div className="analytics-metrics"><div><span>Comments received</span><strong>{commentsCount.toLocaleString()}</strong><small>Inbound comment events</small></div><div><span>Direct messages</span><strong>{dmsCount.toLocaleString()}</strong><small>Inbound DM events</small></div><div><span>Leads</span><strong>{leadCount.toLocaleString()}</strong><small>Current pipeline</small></div><div><span>Won</span><strong>{wonCount.toLocaleString()}</strong><small>Current won stage</small></div></div>
        {activeTab === "activity" ? <><section className="card analytics-primary-panel"><ActivityVolume funnel={funnel} /></section><TopPosts tenantId={tenantId} posts={topPosts} keywords={topKeywords} /></> : <><section className="card analytics-primary-panel"><div className="mb-3 flex flex-wrap items-start justify-end gap-3"><Link className="btn-secondary btn-small" to={`/dashboard/${tenantId}/leads`}>View leads</Link></div><PipelineProgression funnel={funnel} />{funnel.unmappedLeadCount > 0 && <div className="banner mt-4" role="status"><strong>{funnel.unmappedLeadCount.toLocaleString()} leads have an unrecognized stage.</strong><p className="muted small m-0 mt-1">They remain included in total leads but are not assigned to a known pipeline stage. Review the records; analytics cannot infer their intended stage.</p><Link className="link-button inline-block mt-2" to={`/dashboard/${tenantId}/leads`}>Review lead records</Link></div>}</section><div className="stat-grid analytics-revenue-grid"><div className="stat"><div className="stat-value">{funnel.openWithNoOutcome.toLocaleString()}</div><div className="stat-label">Leads with no final outcome</div></div>{revenue === null ? <div className="stat"><div className="stat-value">…</div><div className="stat-label">Revenue</div></div> : revenue.length === 0 ? <div className="stat"><div className="stat-value">—</div><div className="stat-label">Revenue (no won deals yet)</div></div> : revenue.map((item, index) => <div className="stat" key={`${item.currency ?? "currency"}-${index}`}><div className="stat-value">{formatMoney(item.currency, item.total)}</div><div className="stat-label">Revenue ({item.currency ?? "unknown"}, won deals)</div></div>)}</div></>}
      </>}
    </div>
  );
}
