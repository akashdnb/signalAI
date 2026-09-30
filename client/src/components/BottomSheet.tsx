import type { ReactNode } from "react";
import { CloseIcon } from "./icons";

/**
 * Mobile-first sheet: slides up from the bottom and fills the width on
 * narrow viewports (safe-area aware), becomes a centered dialog at md+ —
 * one primitive instead of a phone-only component plus a separate desktop
 * modal, since every call site wants "bottom sheet on phone, small dialog
 * on desktop" rather than two different components to keep in sync.
 */
export function BottomSheet({
  title,
  onClose,
  children,
  maxWidth = 480,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button type="button" aria-label="Close" className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-line bg-card shadow-xl transition-transform duration-200 motion-reduce:transition-none md:max-h-[85vh] md:w-full md:rounded-2xl"
        style={{ maxWidth }}
      >
        <div className="flex justify-center pb-1 pt-2 md:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-chip" />
        </div>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="m-0 text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
