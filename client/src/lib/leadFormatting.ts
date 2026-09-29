import type { HandoffStatus, PipelineStage } from "../api";

/** Shared by DashboardPage, LeadDetailPage, and InboxPage — was independently duplicated in the first two before InboxPage made it a third. */
export const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "meeting_scheduled", label: "Meeting Scheduled" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/** Compact relative time for list rows (Inbox conversation list) — falls back to a plain date once it's more than a day old, where "3d ago" stops being more useful than the actual date. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

export function formatLastContactVia(lastEventType: string | null): string {
  if (lastEventType === "comment") return "Comment";
  if (lastEventType === "message") return "DM";
  return "—";
}

export function handoffLabel(status: HandoffStatus): { text: string; className: string } {
  if (status === "human") return { text: "Human is replying", className: "pill pill-ok" };
  if (status === "requested") return { text: "Escalated — needs attention", className: "pill pill-error" };
  return { text: "AI is replying", className: "pill" };
}
