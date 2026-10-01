import type { ReactNode } from "react";
import { CloseIcon } from "./icons";

/**
 * Shared modal primitive:
 * - mobile: bottom sheet
 * - desktop: centered dialog
 * - content-aware by default, with optional fixed-height mode
 * - fixed header/footer with scrollable body
 */
export function BottomSheet({
  title,
  onClose,
  children,
  maxWidth = 480,
  headerContent,
  footer,
  bodyClassName = "",
  height,
  zIndex = 50,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  headerContent?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  height?: number | string;
  zIndex?: number;
}) {
  return (
    <div
      className="fixed inset-0 flex items-end justify-center md:items-center"
      style={{ zIndex }}
    >
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92vh] w-full min-h-0 flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-xl md:max-h-[88vh] md:rounded-2xl"
        style={{
          maxWidth,
          ...(height !== undefined
            ? { height: typeof height === "number" ? `${height}px` : height }
            : {}),
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 md:px-6 md:py-4">
          <div className="min-w-0 flex-1">
            {headerContent ?? (
              <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-ink">
                {title}
              </h2>
            )}
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6 ${bodyClassName}`}
          style={{
            paddingBottom:
              "calc(1.25rem + env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            className="shrink-0 border-t border-line bg-card px-5 py-3.5 md:px-6"
            style={{
              paddingBottom:
                "calc(0.875rem + env(safe-area-inset-bottom))",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
