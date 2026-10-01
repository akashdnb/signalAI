import { useMemo, useState } from "react";
import type { Campaign, TriggerSource } from "../../api";
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
type SortOption = "updated_desc" | "updated_asc" | "name_asc";

function triggerLabel(triggerSource: TriggerSource): string {
  if (triggerSource === "message") return "Direct message";
  if (triggerSource === "both") return "Comment + DM";
  return "Comment";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function JourneySummary({ campaign }: { campaign: Campaign }) {
  if (campaign.description?.trim()) return <>{campaign.description.trim()}</>;

  const count = campaign.keywords.length;
  return (
    <>
      {triggerLabel(campaign.triggerSource)} · {count} keyword{count === 1 ? "" : "s"}
    </>
  );
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

export function JourneyTable({
  campaigns,
  onSelect,
  onNewJourney,
}: {
  campaigns: Campaign[] | null;
  onSelect: (campaignId: string) => void;
  onNewJourney: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [trigger, setTrigger] = useState<TriggerFilter>("all");
  const [sort, setSort] = useState<SortOption>("updated_desc");
  const [page, setPage] = useState(1);

  const pageSize = 10;

  const filtered = useMemo(() => {
    if (!campaigns) return [];

    const query = search.trim().toLowerCase();

    const result = campaigns.filter((campaign) => {
      const searchMatch =
        !query ||
        campaign.name.toLowerCase().includes(query) ||
        campaign.keywords.some((keyword) => keyword.toLowerCase().includes(query)) ||
        (campaign.description ?? "").toLowerCase().includes(query);

      const statusMatch =
        status === "all" ||
        (status === "active" && campaign.enabled) ||
        (status === "inactive" && !campaign.enabled);

      const triggerMatch = trigger === "all" || campaign.triggerSource === trigger;

      return searchMatch && statusMatch && triggerMatch;
    });

    result.sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);

      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();

      return sort === "updated_asc" ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [campaigns, search, status, trigger, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function setFilterAndReset<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
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
            className="hidden h-10 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-medium text-ink hover:bg-chip md:inline-flex"
            title="Import journeys is coming soon"
          >
            <ArrowUpIcon className="h-4 w-4" />
            Import
          </button>

          <button
            type="button"
            className="btn-primary flex h-10 items-center gap-2 px-4 text-sm"
            onClick={onNewJourney}
          >
            + New Journey
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,1fr)_200px_270px_200px]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search journeys..."
            className="!m-0 !h-12 !rounded-xl !bg-card !pl-11 !text-sm"
          />
        </div>

        <select
          value={status}
          onChange={(event) =>
            setFilterAndReset(setStatus, event.target.value as StatusFilter)
          }
          className="!m-0 !h-12 !rounded-xl !bg-card !px-4 !text-sm"
          aria-label="Filter by status"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          value={trigger}
          onChange={(event) =>
            setFilterAndReset(setTrigger, event.target.value as TriggerFilter)
          }
          className="!m-0 !h-12 !rounded-xl !bg-card !px-4 !text-sm"
          aria-label="Filter by trigger"
        >
          <option value="all">All triggers</option>
          <option value="comment">Comment</option>
          <option value="message">Direct message</option>
          <option value="both">Comment + DM</option>
        </select>

        <select
          value={sort}
          onChange={(event) =>
            setFilterAndReset(setSort, event.target.value as SortOption)
          }
          className="!m-0 !h-12 !rounded-xl !bg-card !px-4 !text-sm"
          aria-label="Sort journeys"
        >
          <option value="updated_desc">Last updated</option>
          <option value="updated_asc">Oldest updated</option>
          <option value="name_asc">Name</option>
        </select>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-card">
        <div className="overflow-x-auto">
          {campaigns === null ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl bg-chip" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-[340px] flex-col items-center justify-center gap-2 px-6 text-center">
              <h3 className="m-0 text-base font-semibold text-ink">
                No journeys match your filters
              </h3>
              <p className="muted m-0 text-sm">
                Try a different search or reset one of the filters.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-canvas/40 text-left">
                  <th className="w-12 px-4 py-3">
                    <input type="checkbox" aria-label="Select all journeys" />
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Name
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Trigger
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Replies
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Leads
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
                {visible.map((campaign) => (
                  <tr
                    key={campaign.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => onSelect(campaign.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(campaign.id);
                      }
                    }}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-chip/35 focus:bg-chip/35 focus:outline-none"
                  >
                    <td className="px-4 py-4 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select ${campaign.name}`}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>

                    <td className="max-w-[380px] px-3 py-4 align-middle">
                      <div className="truncate text-[15px] font-semibold text-ink">
                        {campaign.name}
                      </div>
                      <div className="muted mt-0.5 truncate text-xs">
                        <JourneySummary campaign={campaign} />
                      </div>
                    </td>

                    <td className="px-3 py-4 align-middle">
                      <TriggerBadge campaign={campaign} />
                    </td>

                    <td className="px-3 py-4 text-center text-sm font-medium text-ink">—</td>
                    <td className="px-3 py-4 text-center text-sm font-medium text-ink">—</td>

                    <td className="px-3 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                          campaign.enabled
                            ? "bg-[#D1FAE5] text-[#047857]"
                            : "bg-[#E2E8F0] text-[#475569]"
                        }`}
                      >
                        {campaign.enabled ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-3 py-4 text-sm text-subtle">
                      {formatUpdatedAt(campaign.updatedAt)}
                    </td>

                    <td className="px-2 py-4 text-right">
                      <button
                        type="button"
                        aria-label={`More actions for ${campaign.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DotsVerticalIcon className="h-4.5 w-4.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {campaigns !== null && visible.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between md:px-5">
            <span>
              Showing {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} journeys
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

              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
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
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                <ArrowDownIcon className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
