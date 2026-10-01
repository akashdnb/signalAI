import type { Campaign } from "../../api";
import { SearchIcon } from "../icons";

function triggerLabel(campaign: Campaign): string {
  if (campaign.triggerSource === "message") return "DM";
  if (campaign.triggerSource === "both") return "Comment + DM";
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

export function JourneyTable({
  campaigns,
  totalCount,
  search,
  onSearch,
  onSelect,
  onNewJourney,
}: {
  campaigns: Campaign[] | null;
  totalCount: number;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (campaignId: string) => void;
  onNewJourney: () => void;
}) {
  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[15px] font-semibold text-ink">Journeys</h2>
            <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-subtle">
              {totalCount}
            </span>
          </div>
          <p className="muted small m-0 mt-1">
            Configure, test, and publish your AI conversation journeys.
          </p>
        </div>

        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="relative min-w-0 flex-1 md:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search journeys..."
              className="!pl-9"
              aria-label="Search journeys"
            />
          </div>

          <button type="button" className="btn-primary shrink-0" onClick={onNewJourney}>
            + New Journey
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto">
        {campaigns === null ? (
          <div className="space-y-3 p-4 md:p-5">
            <div className="h-14 animate-pulse rounded-xl bg-chip" />
            <div className="h-14 animate-pulse rounded-xl bg-chip" />
            <div className="h-14 animate-pulse rounded-xl bg-chip" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex min-h-[380px] flex-col items-center justify-center gap-2 px-4 text-center">
            <h3 className="m-0 text-base font-semibold text-ink">
              {search.trim() ? "No journeys match your search" : "No journeys yet"}
            </h3>
            <p className="muted m-0 max-w-sm text-sm">
              {search.trim()
                ? "Try a different name or keyword."
                : "Create your first AI conversation journey to start automating Instagram conversations."}
            </p>
            {!search.trim() && (
              <button type="button" className="btn-primary mt-2" onClick={onNewJourney}>
                + New Journey
              </button>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-canvas/50 text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <th className="px-5 py-3">Journey</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Keywords</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3">Updated</th>
              </tr>
            </thead>

            <tbody>
              {campaigns.map((campaign) => (
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
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-chip/40 focus:bg-chip/40 focus:outline-none"
                >
                  <td className="px-5 py-4 align-middle">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{campaign.name}</div>
                      <div className="muted mt-0.5 max-w-[420px] truncate text-xs">
                        {campaign.description ||
                          `Replies to ${campaign.keywords.length} keyword${
                            campaign.keywords.length === 1 ? "" : "s"
                          }`}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-4 text-sm text-ink">{triggerLabel(campaign)}</td>

                  <td className="max-w-[260px] px-4 py-4">
                    <div className="truncate text-xs text-subtle">
                      {campaign.keywords.slice(0, 4).join(", ")}
                      {campaign.keywords.length > 4 ? "…" : ""}
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`text-[11px] ${campaign.enabled ? "pill pill-ok" : "pill"}`}
                      style={{ marginLeft: 0, padding: "0.05rem 0.5rem" }}
                    >
                      <span className="mr-1">●</span>
                      {campaign.enabled ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-xs text-subtle">
                    {formatUpdatedAt(campaign.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
