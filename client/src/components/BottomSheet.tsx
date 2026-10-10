import { useEffect, useRef, type ReactNode } from "react";
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
  closeDisabled = false,
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
  closeDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousBodyOverflow = document.body.style.overflow;

    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

    document.body.style.overflow = "hidden";
    (getFocusableElements()[0] ?? dialog).focus();

    function handleKeyDown(event: KeyboardEvent) {
      // A nested alert dialog (for example, confirming discard) owns focus
      // while it is open; let that dialog manage its own keyboard interaction.
      const activeElement = document.activeElement;
      const activeDialog =
        activeElement instanceof HTMLElement
          ? activeElement.closest('[role="alertdialog"], [role="dialog"][aria-modal="true"]')
          : null;
      if (activeDialog && activeDialog !== dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeDisabled) onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog!.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog!.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog!.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previousActiveElement?.isConnected) previousActiveElement.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 flex items-end justify-center md:items-center"
      style={{ zIndex }}
    >
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-black/40"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !closeDisabled) onCloseRef.current();
        }}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
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
            disabled={closeDisabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
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
