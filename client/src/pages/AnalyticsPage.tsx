import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type Funnel, type RevenueByCurrency, type TopKeyword, type TopPost } from "../api";

const FUNNEL_COLORS = ["--funnel-1", "--funnel-2", "--funnel-3", "--funnel-4", "--funnel-5", "--funnel-6"];

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

function formatMoney(currency: string, total: number): string {
  const symbol = CURRENCY_SYMBOL[currency];
  const amount = total.toLocaleString();
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
}

function FunnelChart({ funnel }: { funnel: Funnel }) {
  const barHeight = 24;
  const gap = 12;
  const labelWidth = 160;
  const chartWidth = 420;
  const height = funnel.stages.length * (barHeight + gap);

  // Comments/DMs are independent event counts, not a subset of Leads — a
  // lead can arrive via DM alone with no comment, so Leads can exceed
  // Comments. Bar widths scale against the true max across every stage
  // (never just stage[0]) so nothing overflows the chart regardless of
  // which stage happens to be biggest. Percentages are anchored to Leads
  // instead — every pipeline-stage count from Qualified onward is a real
  // subset of Leads by construction, so "% of Leads" is always <= 100%
  // and meaningful; Comments/DMs still show their own % of Leads too
  // (can exceed 100%, e.g. several comments from the same lead).
  const barMax = Math.max(...funnel.stages.map((s) => s.count), 1);
  const pctBase = funnel.stages.find((s) => s.key === "leads")?.count || funnel.stages[0]?.count || 1;
  const pctLabel = funnel.stages.find((s) => s.key === "leads")?.label ?? "Leads";

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${labelWidth + chartWidth + 70} ${height}`} role="img" aria-label="Conversion funnel">
        {funnel.stages.map((stage, i) => {
          const width = Math.max((stage.count / barMax) * chartWidth, stage.count > 0 ? 4 : 0);
          const y = i * (barHeight + gap);
          const pct = Math.round((stage.count / pctBase) * 100);
          return (
            <g key={stage.key}>
              <text x={labelWidth - 10} y={y + barHeight / 2 + 4} textAnchor="end" fontSize="13" fill="var(--text)">
                {stage.label}
              </text>
              <rect x={labelWidth} y={y} width={2} height={barHeight} fill="var(--bg)" />
              <rect
                x={labelWidth + 2}
                y={y}
                width={width}
                height={barHeight}
                rx={4}
                fill={`var(${FUNNEL_COLORS[i] ?? "--funnel-6"})`}
              >
                <title>
                  {stage.label}: {stage.count} ({pct}% of {pctLabel})
                </title>
              </rect>
              <text x={labelWidth + width + 12} y={y + barHeight / 2 + 4} fontSize="13" fill="var(--text)">
                {stage.count} ({pct}%)
              </text>
            </g>
          );
        })}
      </svg>

      {/* Accessible table view of the same data — see dataviz skill's "a table view always exists" rule. */}
      <table className="table" style={{ marginTop: "1rem" }}>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Count</th>
            <th>% of {pctLabel}</th>
          </tr>
        </thead>
        <tbody>
          {funnel.stages.map((stage) => (
            <tr key={stage.key}>
              <td>{stage.label}</td>
              <td>{stage.count}</td>
              <td>{Math.round((stage.count / pctBase) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [revenue, setRevenue] = useState<RevenueByCurrency[] | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[] | null>(null);
  const [topKeywords, setTopKeywords] = useState<TopKeyword[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      try {
        const [f, r, posts, keywords] = await Promise.all([
          api.getFunnel(tenantId!),
          api.getRevenue(tenantId!),
          api.getTopPosts(tenantId!),
          api.getTopKeywords(tenantId!),
        ]);
        if (cancelled) return;
        setFunnel(f);
        setRevenue(r);
        setTopPosts(posts);
        setTopKeywords(keywords);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate]);

  if (!tenantId) return null;

  return (
    <div className="page">
      <h1>Analytics</h1>
      {error && <div className="banner banner-error">{error}</div>}

      <section className="card">
        <h2>Conversion Funnel</h2>
        {funnel === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <FunnelChart funnel={funnel} />
            <p className="muted small" style={{ marginTop: "0.75rem" }}>
              Based on each lead's current stage, not a historical cohort funnel — a lead marked Lost no longer
              counts toward later stages even if it reached them first.
            </p>
          </>
        )}
      </section>

      <div className="stat-grid" style={{ marginBottom: "1.25rem" }}>
        {funnel !== null && (
          <div className="stat">
            <div className="stat-value">{funnel.openWithNoOutcome}</div>
            <div className="stat-label">Leads still open (no outcome yet)</div>
          </div>
        )}
        {revenue === null ? (
          <div className="stat">
            <div className="stat-value">…</div>
            <div className="stat-label">Revenue</div>
          </div>
        ) : revenue.length === 0 ? (
          <div className="stat">
            <div className="stat-value">—</div>
            <div className="stat-label">Revenue (no won deals yet)</div>
          </div>
        ) : (
          revenue.map((r) => (
            <div className="stat" key={r.currency}>
              <div className="stat-value">{formatMoney(r.currency, r.total)}</div>
              <div className="stat-label">Revenue ({r.currency}, won deals)</div>
            </div>
          ))
        )}
      </div>

      <section className="card">
        <h2>Top Performing Posts</h2>
        {topPosts === null ? (
          <p className="muted">Loading…</p>
        ) : topPosts.length === 0 ? (
          <p className="muted">No comments yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {topPosts.map((p) => (
                <tr key={p.mediaId}>
                  <td>
                    {p.permalink ? (
                      <a href={p.permalink} target="_blank" rel="noreferrer">
                        {p.caption ?? p.mediaId}
                      </a>
                    ) : (
                      p.caption ?? p.mediaId
                    )}
                  </td>
                  <td>{p.commentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {topKeywords && topKeywords.length > 0 && (
          <>
            <h3 style={{ marginTop: "1.25rem" }}>Top Trigger Keywords</h3>
            <div>
              {topKeywords.map((k) => (
                <span className="tag-chip" key={k.keyword}>
                  {k.keyword} ({k.matchCount})
                </span>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
