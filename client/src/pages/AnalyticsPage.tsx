import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type Funnel, type RevenueByCurrency, type TopKeyword, type TopPost } from "../api";
import { useTenant } from "../context/TenantContext";

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

function formatMoney(currency: string, total: number): string {
  const symbol = CURRENCY_SYMBOL[currency];
  const amount = total.toLocaleString();
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
}

function ActivityVolume({ funnel }: { funnel: Funnel }) {
  const activity = funnel.stages.filter((stage) => stage.key === "comments" || stage.key === "dms");
  const maxCount = Math.max(1, ...activity.map((stage) => stage.count));
  return (
    <div className="space-y-5">
      <p className="muted small">All-time activity totals. Comments are inbound comment events; DMs are send reservations, recorded before delivery is attempted. A send can later fail, and one person can generate multiple events. These are not conversion rates.</p>
      {activity.map((stage) => (
        <div key={stage.key} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3"><span className="text-sm font-medium text-ink">{stage.label}</span><strong className="text-sm tabular-nums text-ink">{stage.count.toLocaleString()}</strong></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-chip" role="presentation"><div className="h-full rounded-full bg-accent" style={{ width: `${(stage.count / maxCount) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function PipelineProgression({ funnel }: { funnel: Funnel }) {
  const stages = funnel.stages.filter((stage) => !["comments", "dms"].includes(stage.key));
  const leadCount = stages.find((stage) => stage.key === "leads")?.count ?? 0;
  return (
    <div>
      <p className="muted small mb-4">Current status of all lead records, not a historical conversion cohort. Percentages use all leads as the denominator and show the share currently at or beyond each stage; lost leads are excluded from earlier-stage totals. Activity totals above use a different population.</p>
      <div className="space-y-4">{stages.map((stage) => { const pct = leadCount > 0 ? Math.round((stage.count / leadCount) * 100) : 0; return <div key={stage.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2"><div className="min-w-0 text-sm font-medium text-ink">{stage.label}</div><div className="whitespace-nowrap text-right text-sm tabular-nums text-subtle">{stage.count.toLocaleString()} <span className="text-xs">({pct}%)</span></div><div className="col-span-2 h-2.5 overflow-hidden rounded-full bg-chip" role="presentation"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div></div>; })}</div>
      <div className="analytics-table-scroll"><table className="table mt-4"><caption className="sr-only">Current pipeline counts and share of all leads at or beyond each stage</caption><thead><tr><th>Pipeline stage</th><th>Leads</th><th>Share of leads</th></tr></thead><tbody>{stages.map((stage) => <tr key={stage.key}><td>{stage.label}</td><td className="tabular-nums">{stage.count.toLocaleString()}</td><td className="tabular-nums">{leadCount > 0 ? Math.round((stage.count / leadCount) * 100) : 0}%</td></tr>)}</tbody></table></div>
    </div>
  );
}

export function AnalyticsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
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
  return (
    <div className="page page-wide page-analytics">
      <div className="mb-6"><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">Performance</p><h1>Analytics</h1><p className="muted mt-1">See the conversations you’re generating and how leads are moving through your pipeline.</p></div>
      {errors.length > 0 && <div className="banner banner-error flex flex-wrap items-start justify-between gap-3" role="alert"><div><strong>Some analytics could not be loaded.</strong><ul className="m-0 mt-1 pl-5">{errors.map((item) => <li key={item}>{item}</li>)}</ul></div><button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button></div>}
      {funnel === null ? <section className="card"><p className="muted" role="status">{errors.length > 0 ? "Pipeline analytics could not be loaded." : "Loading analytics…"}</p></section> : <>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="card mb-0"><h2>Activity volume</h2><ActivityVolume funnel={funnel} /></section>
          <section className="card mb-0"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h2 className="m-0">Pipeline progression</h2><p className="muted small mt-1">Counts show current leads at or beyond each stage, not a historical conversion cohort.</p></div><Link className="btn-secondary btn-small" to={`/dashboard/${tenantId}/leads`}>View leads</Link></div><PipelineProgression funnel={funnel} />{funnel.unmappedLeadCount > 0 && <div className="banner mt-4" role="status"><strong>{funnel.unmappedLeadCount.toLocaleString()} leads have an unrecognized stage.</strong><p className="muted small m-0 mt-1">They remain included in total leads but are not assigned to a known pipeline stage. Review the records; analytics cannot infer their intended stage.</p><Link className="link-button inline-block mt-2" to={`/dashboard/${tenantId}/leads`}>Review lead records</Link></div>}</section>
        </div>
        <div className="stat-grid mt-4" style={{ marginBottom: "1.25rem" }}><div className="stat"><div className="stat-value">{funnel.openWithNoOutcome.toLocaleString()}</div><div className="stat-label">Leads with no final outcome</div></div>{revenue === null ? <div className="stat"><div className="stat-value">…</div><div className="stat-label">Revenue</div></div> : revenue.length === 0 ? <div className="stat"><div className="stat-value">—</div><div className="stat-label">Revenue (no won deals yet)</div></div> : revenue.map((r) => <div className="stat" key={r.currency}><div className="stat-value">{formatMoney(r.currency, r.total)}</div><div className="stat-label">Revenue ({r.currency}, won deals)</div></div>)}</div>
      </>}
      <section className="card"><h2>Top performing posts</h2><p className="muted small">View leads with a recorded comment event for the exact post. This is an event association, not proof of conversion attribution.</p>{topPosts === null ? <p className="muted">Loading…</p> : topPosts.length === 0 ? <p className="muted">No comments yet.</p> : <div className="-mx-2 overflow-x-auto sm:mx-0"><table className="table min-w-[560px]"><thead><tr><th>Post</th><th>Comments</th><th>Next step</th></tr></thead><tbody>{topPosts.map((p) => <tr key={p.mediaId}><td>{p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer">{p.caption ?? p.mediaId}</a> : p.caption ?? p.mediaId}</td><td>{p.commentCount}</td><td><Link className="link-button" to={`/dashboard/${tenantId}/leads?sourceMediaId=${encodeURIComponent(p.mediaId)}`}>View linked leads</Link></td></tr>)}</tbody></table></div>}{topKeywords === null ? <p className="muted small mt-3">Trigger keywords are unavailable right now.</p> : topKeywords.length > 0 && <><h3 style={{ marginTop: "1.25rem" }}>Top trigger keywords</h3><div>{topKeywords.map((k) => <span className="tag-chip" key={k.keyword}>{k.keyword} ({k.matchCount})</span>)}</div></>}</section>
    </div>
  );
}
