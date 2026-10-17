import type { HandoffStatus, LeadScoreBand, PipelineStage } from "../api";

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

/** Same thresholds as formatRelativeTime without the "ago" suffix — the Inbox conversation list shows bare "2m"/"1h" against each row's timestamp. */
export function formatCompactRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return date.toLocaleDateString();
}

export function formatLastContactVia(lastEventType: string | null): string {
  if (lastEventType === "comment") return "Comment";
  if (lastEventType === "message") return "DM";
  return "—";
}

/** Convert raw Instagram media URLs in lead snippets to concise semantic labels while retaining the exact source in the title. */
export function formatLeadMessagePreview(preview: string | null | undefined): { label: string; title?: string } | null {
  const value = preview?.trim();
  if (!value) return null;

  if (/https?:\/\/(?:www\.)?instagram\.com\/reel\//i.test(value)) {
    return { label: "Shared Instagram reel", title: value };
  }
  if (/https?:\/\/(?:www\.)?instagram\.com\/(?:p|tv)\//i.test(value)) {
    return { label: "Shared Instagram post", title: value };
  }
  if (/https?:\/\/lookaside\.fbsbx\.com\/ig_messaging_cdn\//i.test(value)) {
    return { label: "Shared Instagram media", title: value };
  }

  return { label: value, title: value };
}

/** Explain how much of the Instagram messaging window remains, with the exact expiry available as the title. */
export function formatMessagingWindow(windowOpenUntil: string | null | undefined): { label: string; title?: string; open: boolean } {
  if (!windowOpenUntil) return { label: "Closed", open: false };
  const expiry = new Date(windowOpenUntil);
  const remainingMs = expiry.getTime() - Date.now();
  if (remainingMs <= 0) return { label: "Closed", title: `Expired ${expiry.toLocaleString()}`, open: false };

  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const label = remainingMinutes < 60
    ? `Open · ${remainingMinutes}m left`
    : `Open · ${Math.ceil(remainingMinutes / 60)}h left`;
  return { label, title: `Open until ${expiry.toLocaleString()}`, open: true };
}

/**
 * Stable fallback for Instagram leads whose profile lookup hasn't produced a
 * handle yet. The lead remains addressable even while username recovery runs.
 */
export function leadDisplayName(username: string | null | undefined): string {
  return username?.trim() || "Instagram user";
}

/** Derived from the account's own email, never invented — "priya.shah@x.com" -> "Priya". Falls back to "there" if no session. */
export function deriveDisplayName(email?: string): string {
  const local = email?.split("@")[0];
  const first = local?.split(/[._+-]/)[0];
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function handoffLabel(status: HandoffStatus): { text: string; className: string } {
  if (status === "human") return { text: "Human is replying", className: "pill pill-ok" };
  if (status === "requested") return { text: "Escalated — needs attention", className: "pill pill-error" };
  return { text: "AI is replying", className: "pill" };
}

/** Phase 2C Lead Intelligence: creator-facing label/style for a score band. */
export function scoreBandLabel(band: LeadScoreBand): { text: string; className: string } {
  if (band === "very_hot") return { text: "VERY HOT", className: "pill pill-ok" };
  if (band === "hot") return { text: "HOT", className: "pill pill-ok" };
  if (band === "warm") return { text: "WARM", className: "pill" };
  return { text: "COLD", className: "pill" };
}

/** "ready_to_buy" -> "Ready to buy" — the canonical intent value is a storage key, never shown raw. */
export function formatIntentLabel(intent: string): string {
  const spaced = intent.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** ₹ formatting with lakh/crore grouping, matching how budgets are discussed in the captured text itself. */
export function formatBudgetValue(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} crore`;
  if (value >= 100_000) return `₹${(value / 100_000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} lakh`;
  return `₹${value.toLocaleString("en-IN")}`;
}
