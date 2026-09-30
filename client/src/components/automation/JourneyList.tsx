import { useState } from "react";
import type { Campaign } from "../../api";
import { DotsVerticalIcon, SearchIcon } from "../icons";

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
  onToggleEnabled,
}: {
  campaign: Campaign;
  selected: boolean;
  onSelect: () => void;
  onToggleEnabled: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={`relative cursor-pointer rounded-xl border p-3.5 transition-colors ${
        selected ? "border-accent bg-chip shadow-sm" : "border-line bg-card hover:border-accent-soft"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{campaign.name}</div>
          <div className="mt-0.5 truncate text-xs text-subtle">{summarize(campaign)}</div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={`More actions for ${campaign.name}`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-card hover:text-ink"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <DotsVerticalIcon className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-line bg-card p-1 shadow-lg">
                <button
                  type="button"
                  className="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-ink hover:bg-chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onToggleEnabled();
                  }}
                >
                  {campaign.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <span className={`mt-2.5 inline-block ${campaign.enabled ? "pill pill-ok" : "pill"}`} style={{ marginLeft: 0 }}>
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
  onToggleEnabled,
}: {
  campaigns: Campaign[] | null;
  totalCount: number;
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onToggleEnabled: (campaign: Campaign) => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-card p-4">
      <h2 className="m-0 text-[15px] font-semibold text-ink">All Journeys ({totalCount})</h2>

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
            <JourneyCard
              key={c.id}
              campaign={c}
              selected={c.id === selectedId}
              onSelect={() => onSelect(c.id)}
              onToggleEnabled={() => onToggleEnabled(c)}
            />
          ))
        )}
      </div>
    </div>
  );
}
