import { useState } from "react";
import type { ConversationsTimeseriesPoint } from "../api";

/**
 * Dashboard's "Activity over time" chart: stacked bars (Comments, DMs) over
 * the trailing real days from getConversationsTimeseries — no invented
 * trend data, matching the preview's bar-chart treatment (incl. the big
 * total count above the chart) instead of a line chart. Ships its own
 * tooltip per bar, plus an accessible table fallback below.
 */
export function ConversationsChart({ data }: { data: ConversationsTimeseriesPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex min-h-24 items-center rounded-xl border border-dashed border-line px-4 py-5">
        <div>
          <p className="m-0 text-sm font-semibold text-ink">No conversation data available</p>
          <p className="muted mb-0 mt-1 text-sm">There are no daily records for this period yet.</p>
        </div>
      </div>
    );
  }

  const totalEvents = data.reduce((sum, point) => sum + point.comments + point.dms, 0);
  const hasActivity = totalEvents > 0;
  if (!hasActivity) {
    return (
      <div className="space-y-3">
        <div className="flex min-h-24 items-center rounded-xl border border-dashed border-line px-4 py-5">
          <div>
            <p className="m-0 text-sm font-semibold text-ink">No conversations recorded</p>
            <p className="muted mb-0 mt-1 text-sm">Comments and DMs sent will appear here when activity is recorded.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-chip/50 px-3 py-2">
            <div className="text-xs text-subtle">Comments</div>
            <div className="text-lg font-semibold text-ink">0</div>
          </div>
          <div className="rounded-lg bg-chip/50 px-3 py-2">
            <div className="text-xs text-subtle">DMs sent</div>
            <div className="text-lg font-semibold text-ink">0</div>
          </div>
        </div>
        <details>
          <summary className="cursor-pointer text-xs text-subtle">View daily records</summary>
          <table className="table mt-2">
            <thead>
              <tr>
                <th>Date</th>
                <th>Comments</th>
                <th>DMs sent</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date}>
                  <td>{new Date(point.date).toLocaleDateString()}</td>
                  <td>{point.comments}</td>
                  <td>{point.dms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padding = { top: 20, right: 8, bottom: 24, left: 8 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const dayTotals = data.map((d) => d.comments + d.dms);
  const maxTotal = Math.max(1, ...dayTotals);
  const gap = data.length > 1 ? plotW * 0.015 : 0;
  const barW = Math.max(2, plotW / data.length - gap);

  const bars = data.map((d, i) => {
    const total = d.comments + d.dms;
    const totalH = (total / maxTotal) * plotH;
    const commentsH = total > 0 ? (d.comments / total) * totalH : 0;
    const dmsH = totalH - commentsH;
    const x = padding.left + i * (barW + gap);
    const top = padding.top + plotH - totalH;
    return { x, top, totalH, commentsH, dmsH, total };
  });

  const period =
    data.length > 1
      ? `${new Date(data[0]!.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(data[data.length - 1]!.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : new Date(data[0]!.date).toLocaleDateString();

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div>
      <div className="mb-4">
        <span className="text-[32px] font-bold leading-none text-ink">{totalEvents.toLocaleString()}</span>
        <span className="ml-2 text-sm text-subtle">inbound events · {period}</span>
      </div>

      <div className="mb-3 flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-subtle">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          Comments
        </span>
        <span className="flex items-center gap-1.5 text-subtle">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent-cyan)" }} />
          DMs sent
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Comments and DMs, ${period}`}>
        <line x1={padding.left} x2={width - padding.right} y1={padding.top + plotH} y2={padding.top + plotH} stroke="var(--border)" strokeWidth={1} />

        {bars.map((bar, i) => (
          <g key={data[i]!.date} onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex((v) => (v === i ? null : v))}>
            <rect x={bar.x} y={padding.top} width={barW} height={plotH} fill="transparent" />
            {bar.total > 0 && (
              <>
                <rect x={bar.x} y={bar.top + bar.dmsH} width={barW} height={bar.commentsH} rx={2} fill="var(--accent)" opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.45} />
                <rect x={bar.x} y={bar.top} width={barW} height={bar.dmsH} rx={2} fill="var(--accent-cyan)" opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.45} />
              </>
            )}
            {bar.total > 0 && (
              <text x={bar.x + barW / 2} y={bar.top - 6} fontSize="11" fill="var(--text-muted)" textAnchor="middle">
                {bar.total}
              </text>
            )}
            {(data.length <= 10 || i === 0 || i === data.length - 1 || i === Math.floor((data.length - 1) / 2)) && (
              <text x={bar.x + barW / 2} y={height - 4} fontSize="11" fill="var(--text-muted)" textAnchor="middle">
                {new Date(data[i]!.date).toLocaleDateString(undefined, { weekday: data.length <= 10 ? "short" : undefined, month: data.length <= 10 ? undefined : "short", day: "numeric" })}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hovered && (
        <div className="text-xs text-subtle">
          <strong className="text-ink">{new Date(hovered.date).toLocaleDateString()}</strong> — {hovered.comments} comments,{" "}
          {hovered.dms} DMs
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-subtle">View as table</summary>
        <table className="table mt-2">
          <thead>
            <tr>
              <th>Date</th>
              <th>Comments</th>
              <th>DMs sent</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{new Date(d.date).toLocaleDateString()}</td>
                <td>{d.comments}</td>
                <td>{d.dms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
