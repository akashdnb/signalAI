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
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg ${
            t.kind === "error" ? "border-err bg-err text-err-ink" : "border-line bg-card text-ink"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
