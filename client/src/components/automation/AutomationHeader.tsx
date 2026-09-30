import { useState } from "react";
import { DotsVerticalIcon, EyeIcon, FileTextIcon, PlusIcon } from "../icons";

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
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4">
      <div className="min-w-0">
        <h1 className="m-0 text-xl font-bold leading-tight text-ink">Automation</h1>
        <p className="muted m-0 mt-0.5 max-w-2xl truncate text-xs leading-snug md:text-sm">
          Create AI-powered conversations that turn Instagram comments and DMs into qualified leads.
        </p>
      </div>

      {/* Desktop: every action visible at once. */}
      <div className="hidden shrink-0 flex-wrap items-center gap-2 md:flex">
        <div className="relative">
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-ink hover:bg-chip"
            onClick={() => setShowDocsNote((v) => !v)}
          >
            <FileTextIcon className="h-4 w-4" />
            Docs
          </button>
          {showDocsNote && (
            <div className="absolute right-0 top-10 z-20 w-52 rounded-lg border border-line bg-card p-2.5 text-xs text-subtle shadow-lg">
              Documentation is coming soon.
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={previewDisabled}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-ink hover:bg-chip disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onPreview}
        >
          <EyeIcon className="h-4 w-4" />
          Preview
        </button>

        <button
          type="button"
          disabled={publishDisabled || publishing}
          className="btn-primary flex h-9 items-center gap-1.5 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onPublish}
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>

        <button type="button" className="btn-primary flex h-9 items-center gap-1.5 px-4 text-sm" onClick={onNewJourney}>
          <PlusIcon className="h-4 w-4" />
          New Journey
        </button>
      </div>

      {/* Mobile: only "New Journey" is always visible; Docs/Preview/Publish tuck into an overflow menu. */}
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
            aria-label="More actions"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-card text-ink"
            onClick={() => setShowMobileMenu((v) => !v)}
          >
            <DotsVerticalIcon className="h-5 w-5" />
          </button>
          {showMobileMenu && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setShowMobileMenu(false)}
              />
              <div className="absolute right-0 top-12 z-20 w-48 rounded-xl border border-line bg-card p-1.5 shadow-lg">
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip"
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowDocsNote(true);
                  }}
                >
                  <FileTextIcon className="h-4.5 w-4.5" />
                  Docs
                </button>
                <button
                  type="button"
                  disabled={previewDisabled}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip disabled:opacity-50"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onPreview();
                  }}
                >
                  <EyeIcon className="h-4.5 w-4.5" />
                  Preview
                </button>
                <button
                  type="button"
                  disabled={publishDisabled || publishing}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip disabled:opacity-50"
                  onClick={() => {
                    setShowMobileMenu(false);
                    onPublish();
                  }}
                >
                  {publishing ? "Publishing…" : "Publish"}
                </button>
              </div>
            </>
          )}
        </div>
        {showDocsNote && (
          <div className="fixed left-4 right-4 top-16 z-20 rounded-lg border border-line bg-card p-3 text-sm text-subtle shadow-lg">
            Documentation is coming soon.
            <button type="button" className="link-button ml-2" onClick={() => setShowDocsNote(false)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
