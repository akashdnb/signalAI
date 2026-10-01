import { useMemo, useState } from "react";
import { BottomSheet } from "../BottomSheet";
import { api, type Campaign, type TriggerSource } from "../../api";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsVerticalIcon,
  InstagramMarkIcon,
  SearchIcon,
  SendIcon,
} from "../icons";

type StatusFilter = "all" | "active" | "inactive";
type TriggerFilter = "all" | TriggerSource;
type SortOption =
  | "updated_desc"
  | "updated_asc"
  | "name_asc"
  | "name_desc";

function triggerLabel(triggerSource: TriggerSource): string {
  if (triggerSource === "message") return "Direct message";
  if (triggerSource === "both") return "Comment + DM";
  return "Comment";
}

function relativeUpdatedAt(value: string): { label: string; title: string } {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { label: "—", title: value };
  }

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);

  if (minutes < 1) return { label: "Just now", title: date.toLocaleString() };
  if (minutes < 60) {
    return { label: `${minutes} min ago`, title: date.toLocaleString() };
  }
  if (hours < 24) {
    return {
      label: `${hours} hour${hours === 1 ? "" : "s"} ago`,
      title: date.toLocaleString(),
    };
  }
  if (hours < 48) return { label: "Yesterday", title: date.toLocaleString() };

  const sameYear = date.getFullYear() === new Date().getFullYear();

  return {
    label: date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    }),
    title: date.toLocaleString(),
  };
}

function triggerSummary(campaign: Campaign): string {
  if (campaign.description?.trim()) return campaign.description.trim();

  const count = campaign.keywords.length;
  const keywordLabel = `${count} keyword${count === 1 ? "" : "s"}`;

  return `${triggerLabel(campaign.triggerSource)} · ${keywordLabel}`;
}

function TriggerBadge({ campaign }: { campaign: Campaign }) {
  const isComment = campaign.triggerSource !== "message";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
        campaign.triggerSource === "both"
          ? "bg-[#F3E8FF] text-[#5B21B6]"
          : isComment
            ? "bg-[#F3E8FF] text-[#6D28D9]"
            : "bg-[#DBEAFE] text-[#1D4ED8]"
      }`}
    >
      {isComment ? (
        <InstagramMarkIcon className="h-4 w-4" />
      ) : (
        <SendIcon className="h-4 w-4" />
      )}
      {triggerLabel(campaign.triggerSource)}
    </span>
  );
}

function ActionMenu({
  campaign,
  onOpen,
  onRename,
  onToggle,
}: {
  campaign: Campaign;
  onOpen: () => void;
  onRename: () => void;
  onToggle: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);

    try {
      await onToggle();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label={`Actions for ${campaign.name}`}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <DotsVerticalIcon className="h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close journey actions"
            className="fixed inset-0 z-20 cursor-default"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute right-0 top-9 z-30 w-44 rounded-xl border border-line bg-card p-1.5 text-left shadow-xl">
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-ink hover:bg-chip"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onOpen();
              }}
            >
              Open
            </button>

            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-ink hover:bg-chip"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onRename();
              }}
            >
              Rename
            </button>

            <button
              type="button"
              disabled={saving}
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-ink hover:bg-chip disabled:opacity-50"
              onClick={(event) => {
                event.stopPropagation();
                void toggle();
              }}
            >
              {saving
                ? "Saving…"
                : campaign.enabled
                  ? "Pause journey"
                  : "Activate journey"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RenameJourney({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(campaign.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const nextName = name.trim();

    if (!nextName) {
      setError("Journey name cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.updateReplyConfig(campaign.tenantId, campaign.id, {
        name: nextName,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename journey");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet title="Rename Journey" onClose={onClose}>
      <label>
        Journey name
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={() => void save()}
          disabled={!name.trim() || saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </BottomSheet>
  );
}

export function JourneyTable({
  campaigns,
  onSelect,
  onNewJourney,
  onChanged,
}: {
  campaigns: Campaign[] | null;
  onSelect: (campaignId: string) => void;
  onNewJourney: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [trigger, setTrigger] = useState<TriggerFilter>("all");
  const [sort, setSort] = useState<SortOption>("updated_desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renameCampaign, setRenameCampaign] = useState<Campaign | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const pageSize = 10;

  const filtered = useMemo(() => {
    if (!campaigns) return [];

    const query = search.trim().toLowerCase();

    const result = campaigns.filter((campaign) => {
      const searchMatch =
        !query ||
        campaign.name.toLowerCase().includes(query) ||
        campaign.keywords.some((keyword) =>
          keyword.toLowerCase().includes(query),
        ) ||
        (campaign.description ?? "").toLowerCase().includes(query);

      const statusMatch =
        status === "all" ||
        (status === "active" && campaign.enabled) ||
        (status === "inactive" && !campaign.enabled);

      const triggerMatch =
        trigger === "all" || campaign.triggerSource === trigger;

      return searchMatch && statusMatch && triggerMatch;
    });

    result.sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);

      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();

      return sort === "updated_asc" ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [campaigns, search, status, trigger, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function toggleSelected(campaignId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);

      return next;
    });
  }

  const allVisibleSelected =
    visible.length > 0 &&
    visible.every((campaign) => selectedIds.has(campaign.id));

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);

      for (const campaign of visible) {
        if (allVisibleSelected) next.delete(campaign.id);
        else next.add(campaign.id);
      }

      return next;
    });
  }

  async function bulkToggle(enabled: boolean) {
    if (selectedIds.size === 0 || !campaigns?.length) return;

    setBulkSaving(true);

    try {
      const tenantId = campaigns[0]!.tenantId;

      await Promise.all(
        [...selectedIds].map((campaignId) =>
          api.setCampaignEnabled(tenantId, campaignId, enabled),
        ),
      );

      setSelectedIds(new Set());
      await onChanged();
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="m-0 text-[21px] font-semibold tracking-[-0.015em] text-ink">
          Journeys ({campaigns?.length ?? 0})
        </h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Import journeys is not available yet"
            className="hidden h-10 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-medium text-subtle opacity-60 md:inline-flex"
          >
            <ArrowUpIcon className="h-4 w-4" />
            Import
          </button>

          <button
            type="button"
            className="btn-primary flex h-10 items-center gap-2 px-4 text-sm whitespace-nowrap"
            onClick={onNewJourney}
          >
            + New Journey
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(280px,1fr)_190px_250px_190px]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search journeys..."
            className="!m-0 !h-11 !rounded-xl !bg-card !pl-10 !text-sm"
          />
        </div>

        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as StatusFilter);
            setPage(1);
          }}
          className="!m-0 !h-11 !rounded-xl !bg-card !px-4 !text-sm"
          aria-label="Filter by status"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          value={trigger}
          onChange={(event) => {
            setTrigger(event.target.value as TriggerFilter);
            setPage(1);
          }}
          className="!m-0 !h-11 !rounded-xl !bg-card !px-4 !text-sm"
          aria-label="Filter by trigger"
        >
          <option value="all">All triggers</option>
          <option value="comment">Comment</option>
          <option value="message">Direct message</option>
          <option value="both">Comment + DM</option>
        </select>

        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as SortOption);
            setPage(1);
          }}
          className="!m-0 !h-11 !rounded-xl !bg-card !px-4 !text-sm"
          aria-label="Sort journeys"
        >
          <option value="updated_desc">Recently updated</option>
          <option value="updated_asc">Oldest updated</option>
          <option value="name_asc">Name A-Z</option>
          <option value="name_desc">Name Z-A</option>
        </select>
      </div>

      {selectedIds.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-soft bg-chip px-4 py-2.5">
          <span className="text-sm font-semibold text-ink">
            {selectedIds.size} selected
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-small"
              disabled={bulkSaving}
              onClick={() => void bulkToggle(true)}
            >
              Activate
            </button>
            <button
              type="button"
              className="btn-secondary btn-small"
              disabled={bulkSaving}
              onClick={() => void bulkToggle(false)}
            >
              Pause
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-subtle hover:text-ink"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-card">
        <div className="overflow-x-auto">
          {campaigns === null ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-xl bg-chip"
                />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <h3 className="m-0 text-lg font-semibold text-ink">
                No journeys yet
              </h3>
              <p className="muted m-0 mt-2 max-w-md text-sm">
                Create your first AI-powered journey to automate conversations.
              </p>
              <button
                type="button"
                className="btn-primary mt-5"
                onClick={onNewJourney}
              >
                + New Journey
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 px-6 text-center">
              <h3 className="m-0 text-base font-semibold text-ink">
                No journeys match your filters
              </h3>
              <p className="muted m-0 text-sm">
                Try changing your search or filters.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-canvas/40 text-left">
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select visible journeys"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Name
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Trigger
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Status
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Updated
                  </th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>

              <tbody>
                {visible.map((campaign) => {
                  const selected = selectedIds.has(campaign.id);
                  const updated = relativeUpdatedAt(campaign.updatedAt);

                  return (
                    <tr
                      key={campaign.id}
                      tabIndex={0}
                      aria-pressed={selected}
                      role="button"
                      onClick={() => onSelect(campaign.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(campaign.id);
                        }
                      }}
                      className={`cursor-pointer border-b border-line last:border-b-0 ${
                        selected ? "bg-chip/55" : "hover:bg-chip/35"
                      } focus:bg-chip/35 focus:outline-none`}
                    >
                      <td className="px-4 py-3.5 align-middle">
                        <input
                          type="checkbox"
                          aria-label={`Select ${campaign.name}`}
                          checked={selected}
                          onChange={() => toggleSelected(campaign.id)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>

                      <td className="max-w-[460px] px-3 py-3.5 align-middle">
                        <div className="text-[15px] font-semibold leading-5 text-ink">
                          {campaign.name}
                        </div>
                        <div className="muted mt-0.5 line-clamp-2 text-xs leading-4">
                          {triggerSummary(campaign)}
                        </div>
                      </td>

                      <td className="px-3 py-3.5 align-middle">
                        <TriggerBadge campaign={campaign} />
                      </td>

                      <td className="px-3 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
                            campaign.enabled
                              ? "bg-[#D1FAE5] text-[#047857]"
                              : "bg-[#E2E8F0] text-[#475569]"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {campaign.enabled ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td
                        className="whitespace-nowrap px-3 py-3.5 text-sm text-subtle"
                        title={updated.title}
                      >
                        {updated.label}
                      </td>

                      <td className="px-2 py-3.5 text-right">
                        <ActionMenu
                          campaign={campaign}
                          onOpen={() => onSelect(campaign.id)}
                          onRename={() => setRenameCampaign(campaign)}
                          onToggle={async () => {
                            await api.setCampaignEnabled(
                              campaign.tenantId,
                              campaign.id,
                              !campaign.enabled,
                            );
                            await onChanged();
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {campaigns !== null && campaigns.length > 0 && visible.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between md:px-5">
            <span>
              Showing {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, filtered.length)} of{" "}
              {filtered.length} journeys
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage === 1}
                aria-label="Previous page"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-card text-ink disabled:opacity-40"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ArrowUpIcon className="h-4 w-4 -rotate-90" />
              </button>

              {Array.from(
                { length: totalPages },
                (_, index) => index + 1,
              ).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold ${
                    safePage === pageNumber
                      ? "border-accent text-accent"
                      : "border-line bg-card text-subtle"
                  }`}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                disabled={safePage === totalPages}
                aria-label="Next page"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-card text-ink disabled:opacity-40"
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                <ArrowDownIcon className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>

      {renameCampaign && (
        <RenameJourney
          campaign={renameCampaign}
          onClose={() => setRenameCampaign(null)}
          onSaved={onChanged}
        />
      )}
    </section>
  );
}
