import { useCallback, useRef, useState } from "react";

interface ToastItem {
  id: number;
  text: string;
  kind: "ok" | "error";
}

/** Bottom-right toast stack (R — Automation revamp). Local to whichever page calls useToasts(), not a global provider — nothing outside Automation needs one yet. */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return { toasts, push };
}

export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  const successToasts = toasts.filter((toast) => toast.kind === "ok");
  const errorToasts = toasts.filter((toast) => toast.kind === "error");

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      {/* Keep the live regions mounted while empty so newly added messages are announced. */}
      <div role="status" aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
        {successToasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-medium text-ink shadow-lg"
          >
            {toast.text}
          </div>
        ))}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="false" className="flex flex-col gap-2">
        {errorToasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-xl border border-err bg-err px-4 py-2.5 text-sm font-medium text-err-ink shadow-lg"
          >
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}
