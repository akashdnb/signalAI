import { PIPELINE_STAGES } from "../lib/leadFormatting";
import type { PipelineStage } from "../api";

/**
 * Pipeline progress is ordinal (New -> ... -> Won), so stages reuse the
 * funnel's already-validated sequential ramp (light = early, dark = far
 * along) instead of arbitrary categorical hues. "Lost" is an outcome
 * status, not a step in the progression, so it gets the reserved error
 * color rather than folding into the ramp.
 */
const STAGE_COLOR: Record<PipelineStage, string> = {
  new: "var(--funnel-6)",
  contacted: "var(--funnel-5)",
  qualified: "var(--funnel-4)",
  meeting_scheduled: "var(--funnel-3)",
  won: "var(--funnel-1)",
  lost: "var(--error-text)",
};

export function LeadsByStageDonut({ counts }: { counts: Record<PipelineStage, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const size = 160;
  const radius = 60;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (total === 0) {
    return <p className="muted">No leads yet.</p>;
  }

  // Precompute each segment's dash length + running offset in one pass
  // rather than mutating a counter inside the render map below.
  const segments = PIPELINE_STAGES.map(({ value, label }) => ({ value, label, count: counts[value] ?? 0 })).reduce<
    Array<{ value: PipelineStage; label: string; count: number; dash: number; offset: number }>
  >((acc, stage) => {
    const previousEnd = acc.length > 0 ? acc[acc.length - 1]!.offset + acc[acc.length - 1]!.dash : 0;
    const dash = (stage.count / total) * circumference;
    acc.push({ ...stage, dash, offset: previousEnd });
    return acc;
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Leads by pipeline stage">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        {/* Rotate -90deg so the first segment starts at 12 o'clock and draws clockwise. */}
        <g transform={`rotate(-90 ${center} ${center})`}>
          {segments
            .filter((s) => s.count > 0)
            .map((s) => (
              <circle
                key={s.value}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={STAGE_COLOR[s.value]}
                strokeWidth={strokeWidth}
                strokeDasharray={`${s.dash} ${circumference - s.dash}`}
                strokeDashoffset={-s.offset}
              >
                <title>
                  {s.label}: {s.count} ({Math.round((s.count / total) * 100)}%)
                </title>
              </circle>
            ))}
        </g>
        <text x={center} y={center - 4} textAnchor="middle" fontSize="20" fontWeight={700} fill="var(--text)">
          {total}
        </text>
        <text x={center} y={center + 14} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
          Total leads
        </text>
      </svg>

      <ul className="list-none space-y-2 p-0 text-sm">
        {PIPELINE_STAGES.map(({ value, label }) => {
          const count = counts[value] ?? 0;
          return (
            <li key={value} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STAGE_COLOR[value] }} />
              <span className="text-ink">{label}</span>
              <span className="text-subtle">
                {count} ({total ? Math.round((count / total) * 100) : 0}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
