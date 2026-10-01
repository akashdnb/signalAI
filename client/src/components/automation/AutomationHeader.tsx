import { useState } from "react";
import { FileTextIcon, PlusIcon } from "../icons";

export function AutomationHeader({
  onNewJourney,
}: {
  onNewJourney: () => void;
}) {
  const [showDocsNote, setShowDocsNote] = useState(false);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4">
      <div className="min-w-0">
        <h1 className="m-0 text-xl font-bold leading-tight text-ink">Automation</h1>
        <p className="muted m-0 mt-0.5 max-w-2xl text-xs leading-snug md:text-sm">
          Create AI-powered conversations that turn Instagram comments and DMs into qualified leads.
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <div className="relative">
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-ink hover:bg-chip"
            onClick={() => setShowDocsNote((value) => !value)}
          >
            <FileTextIcon className="h-4 w-4" />
            Docs
          </button>

          {showDocsNote && (
            <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border border-line bg-card p-2.5 text-xs text-subtle shadow-lg">
              Documentation is coming soon.
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn-primary flex h-9 items-center gap-1.5 px-4 text-sm"
          onClick={onNewJourney}
        >
          <PlusIcon className="h-4 w-4" />
          New Journey
        </button>
      </div>

      <div className="flex w-full shrink-0 items-center gap-2.5 md:hidden">
        <button
          type="button"
          className="btn-primary flex h-11 flex-1 items-center justify-center gap-2"
          onClick={onNewJourney}
        >
          <PlusIcon className="h-4.5 w-4.5" />
          New Journey
        </button>

        <div className="relative shrink-0">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-card text-ink"
            aria-label="Documentation"
            onClick={() => setShowDocsNote((value) => !value)}
          >
            <FileTextIcon className="h-5 w-5" />
          </button>

          {showDocsNote && (
            <div className="absolute right-0 top-12 z-30 w-56 rounded-lg border border-line bg-card p-3 text-sm text-subtle shadow-lg">
              Documentation is coming soon.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
