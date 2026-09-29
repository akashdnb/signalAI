import { useMemo, useState } from "react";
import type { ConversationsTimeseriesPoint } from "../api";

/**
 * Dashboard's "Conversations over time" chart: two lines (Comments, DMs)
 * over the trailing 30 real days from getConversationsTimeseries — no
 * invented trend data. Colors are categorical (identity, not magnitude) so
 * they're assigned in fixed order from the two most separated brand hues
 * (purple/cyan) rather than adjacent steps of one ramp. Ships its own
 * crosshair+tooltip per the dataviz skill's default for line charts, plus
 * an accessible table fallback below.
 */
export function ConversationsChart({ data }: { data: ConversationsTimeseriesPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 640;
  const height = 220;
  const padding = { top: 12, right: 12, bottom: 24, left: 32 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.comments, d.dms)));
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

  const points = useMemo(
    () =>
      data.map((d, i) => ({
        x: padding.left + i * stepX,
        comments: padding.top + plotH - (d.comments / maxValue) * plotH,
        dms: padding.top + plotH - (d.dms / maxValue) * plotH,
      })),
    [data, stepX, maxValue, plotH, padding.left, padding.top],
  );

  const linePath = (key: "comments" | "dms") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p[key].toFixed(1)}`).join(" ");

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const idx = Math.round(relX / (rect.width / (data.length - 1)));
    setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)));
  }

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;
  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div>
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

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Conversations over the last 30 days">
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + plotH * f}
            y2={padding.top + plotH * f}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        <path d={linePath("comments")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath("dms")} fill="none" stroke="var(--accent-cyan)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {hoveredPoint && (
          <>
            <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1={padding.top} y2={padding.top + plotH} stroke="var(--border)" strokeWidth={1} />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.comments} r={4} fill="var(--accent)" stroke="var(--card-bg)" strokeWidth={2} />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.dms} r={4} fill="var(--accent-cyan)" stroke="var(--card-bg)" strokeWidth={2} />
          </>
        )}

        {/* Date ticks: first, middle, last only — 30 labels would collide. */}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
          <text key={i} x={points[i]?.x ?? 0} y={height - 4} fontSize="11" fill="var(--text-muted)" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
            {data[i] ? new Date(data[i]!.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
          </text>
        ))}

        <rect
          x={padding.left}
          y={padding.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
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
