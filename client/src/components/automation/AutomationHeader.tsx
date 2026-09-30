import { useState } from "react";
import { EyeIcon, FileTextIcon, PlusIcon } from "../icons";

export function AutomationHeader({
  onPreview,
  previewDisabled,
  onPublish,
  publishing,
  publishDisabled,
  onNewJourney,
}: {
  onPreview: () => void;
  previewDisabled: boolean;
  onPublish: () => void;
  publishing: boolean;
  publishDisabled: boolean;
  onNewJourney: () => void;
}) {
  const [showDocsNote, setShowDocsNote] = useState(false);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="m-0 text-[28px] font-bold leading-tight text-ink">Automation</h1>
        <p className="muted m-0 mt-1 max-w-xl">
          Create AI-powered conversations that turn Instagram comments and DMs into qualified leads.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-semibold text-ink hover:bg-chip"
            onClick={() => setShowDocsNote((v) => !v)}
          >
            <FileTextIcon className="h-4.5 w-4.5" />
            Docs
          </button>
          {showDocsNote && (
            <div className="absolute right-0 top-11 z-20 w-52 rounded-lg border border-line bg-card p-2.5 text-xs text-subtle shadow-lg">
              Documentation is coming soon.
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={previewDisabled}
          className="flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-semibold text-ink hover:bg-chip disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onPreview}
        >
          <EyeIcon className="h-4.5 w-4.5" />
          Preview
        </button>

        <button
          type="button"
          disabled={publishDisabled || publishing}
          className="btn-primary flex h-10 items-center gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onPublish}
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>

        <button
          type="button"
          className="btn-primary flex h-10 items-center gap-2 px-5"
          onClick={onNewJourney}
        >
          <PlusIcon className="h-4.5 w-4.5" />
          New Journey
        </button>
      </div>
    </div>
  );
}
