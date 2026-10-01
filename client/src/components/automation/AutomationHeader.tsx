import { useState } from "react";
import { FileTextIcon, PlusIcon } from "../icons";

export function AutomationHeader({
  onNewJourney,
}: {
  onNewJourney: () => void;
}) {
  const [showDocsNote, setShowDocsNote] = useState(false);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 text-[26px] font-bold leading-[1.12] tracking-[-0.025em] text-ink">
          Automation
        </h1>
        <p className="muted m-0 mt-1 text-[14px] leading-5">
          Create AI-powered conversations that turn Instagram comments and DMs into qualified leads.
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <div className="relative">
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink hover:bg-chip"
            onClick={() => setShowDocsNote((value) => !value)}
          >
            <FileTextIcon className="h-4 w-4" />
            Docs
          </button>

          {showDocsNote && (
            <div className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-line bg-card p-3 text-xs text-subtle shadow-lg">
              Documentation is coming soon.
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn-primary flex h-10 items-center gap-2 px-4 text-sm"
          onClick={onNewJourney}
        >
          <PlusIcon className="h-4 w-4" />
          New Journey
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:hidden">
        <button
          type="button"
          className="btn-primary flex h-10 items-center gap-2 px-4 text-sm"
          onClick={onNewJourney}
        >
          <PlusIcon className="h-4 w-4" />
          New Journey
        </button>

        <button
          type="button"
          aria-label="Documentation"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-card text-ink"
          onClick={() => setShowDocsNote((value) => !value)}
        >
          <FileTextIcon className="h-4.5 w-4.5" />
        </button>
      </div>

      {showDocsNote && (
        <div className="fixed left-4 right-4 top-16 z-40 rounded-xl border border-line bg-card p-3 text-sm text-subtle shadow-lg md:hidden">
          Documentation is coming soon.
        </div>
      )}
    </div>
  );
}
