import type { Campaign } from "../../api";
import { CloseIcon, SearchIcon } from "../icons";

/** Prefers the journey's own description; falls back to a summary derived from real trigger config for campaigns created before that field existed. */
export function summarize(campaign: Campaign): string {
  if (campaign.description) return campaign.description;
  const count = campaign.keywords.length;
  const kind = campaign.triggerSource === "message" ? "DMs" : campaign.triggerSource === "both" ? "comments & DMs" : "comments";
  return `Replies to ${kind} matching ${count} keyword${count === 1 ? "" : "s"}`;
}

function JourneyCard({
  campaign,
  selected,
  onSelect,
}: {
  campaign: Campaign;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={`cursor-pointer rounded-xl border p-2.5 transition-colors ${
        selected ? "border-accent bg-chip shadow-sm" : "border-line bg-card hover:border-accent-soft"
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{campaign.name}</div>
        <div className="mt-0.5 truncate text-xs text-subtle">{summarize(campaign)}</div>
      </div>

      <span
        className={`mt-1.5 inline-block text-[11px] ${campaign.enabled ? "pill pill-ok" : "pill"}`}
        style={{ marginLeft: 0, padding: "0.05rem 0.5rem" }}
      >
        <span className="mr-1">●</span>
        {campaign.enabled ? "Active" : "Inactive"}
      </span>
    </div>
  );
}

export function JourneyList({
  campaigns,
  totalCount,
  selectedId,
  search,
  onSearch,
  onSelect,
  onClose,
}: {
  campaigns: Campaign[] | null;
  totalCount: number;
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-card p-4 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[15px] font-semibold text-ink">All Journeys ({totalCount})</h2>
        {onClose && (
          <button
            type="button"
            aria-label="Close journeys"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
            onClick={onClose}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative mt-3">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search journeys..."
          className="!pl-9"
        />
      </div>

      <div className="mt-3 flex flex-col gap-2.5 overflow-y-auto">
        {campaigns === null ? (
          <>
            <div className="h-20 animate-pulse rounded-xl bg-chip" />
            <div className="h-20 animate-pulse rounded-xl bg-chip" />
          </>
        ) : campaigns.length === 0 ? (
          <p className="muted small">No journeys match your search.</p>
        ) : (
          campaigns.map((c) => (
            <JourneyCard key={c.id} campaign={c} selected={c.id === selectedId} onSelect={() => onSelect(c.id)} />
          ))
        )}
      </div>
    </div>
  );
}
