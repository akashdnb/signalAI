import { useEffect, type ReactNode } from "react";

/**
 * Desktop-only slide-in overlay panel (md+): sits absolutely within a
 * `relative` ancestor and slides on/off screen via transform, so it overlays
 * the canvas beneath it rather than reflowing layout. Always mounted (even
 * closed) so the slide transition plays; mobile uses BottomSheet instead.
 */
export function DesktopDrawer({
  side,
  width,
  open,
  onClose,
  children,
}: {
  side: "left" | "right";
  width: number;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <div
      className={`absolute inset-y-0 z-20 hidden shrink-0 transition-transform duration-200 motion-reduce:transition-none md:block ${
        side === "left" ? "left-0" : "right-0"
      }`}
      style={{
        width,
        transform: open ? "translateX(0)" : `translateX(${side === "left" ? "-" : ""}110%)`,
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}
