import { useState } from "react";
import type { Campaign } from "../../api";
import { BottomSheet } from "../BottomSheet";
import { ChevronDownIcon, PlusIcon, SearchIcon } from "../icons";
import { summarize } from "./JourneyList";

/**
 * Replaces the desktop's permanent journey-list column on mobile (section
 * 10/11 of the mobile fix spec) — a compact trigger button that opens a
 * bottom sheet with search + the same journey data, instead of a panel
 * that eats the first screen of vertical space.
 */
export function MobileJourneySelector({
  campaigns,
  totalCount,
  selected,
  search,
  onSearch,
  onSelect,
  onNewJourney,
}: {
  campaigns: Campaign[] | null;
  totalCount: number;
  selected: Campaign | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onNewJourney: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <div className="mb-1 text-sm font-medium text-subtle">Journey</div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-card px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-ink">{selected?.name ?? "Select a journey"}</span>
          {selected && (
            <span className={selected.enabled ? "pill pill-ok m-0 mt-0.5 inline-block" : "pill m-0 mt-0.5 inline-block"}>
              <span className="mr-1">●</span>
              {selected.enabled ? "Active" : "Inactive"}
            </span>
          )}
        </span>
        <ChevronDownIcon className="h-5 w-5 shrink-0 text-subtle" />
      </button>

      {open && (
        <BottomSheet title="Select Journey" onClose={() => setOpen(false)}>
          <div className="relative mb-3">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search journeys..."
              className="!pl-9"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            {campaigns === null ? (
              <p className="muted">Loading…</p>
            ) : campaigns.length === 0 ? (
              <p className="muted small">No journeys match your search.</p>
            ) : (
              campaigns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                  className={`flex min-h-11 items-start justify-between gap-2 rounded-xl border px-3.5 py-3 text-left ${
                    c.id === selected?.id ? "border-accent bg-chip" : "border-line bg-card"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      {c.id === selected?.id && <span className="text-accent">✓</span>}
                      <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-subtle">{summarize(c)}</span>
                  </span>
                  <span className={c.enabled ? "pill pill-ok m-0 shrink-0" : "pill m-0 shrink-0"}>
                    {c.enabled ? "Active" : "Inactive"}
                  </span>
                </button>
              ))
            )}
          </div>

          <button
            type="button"
            className="btn-primary mt-4 flex min-h-11 w-full items-center justify-center gap-2"
            onClick={() => {
              setOpen(false);
              onNewJourney();
            }}
          >
            <PlusIcon className="h-4.5 w-4.5" />
            New Journey
          </button>

          {totalCount > 0 && <p className="muted small mt-2 text-center">{totalCount} total journeys</p>}
        </BottomSheet>
      )}
    </div>
  );
}
