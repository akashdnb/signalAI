import type { ReactNode } from "react";

export function LoadingState({
  label = "Loading…",
  description,
  className = "",
}: {
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center", className].filter(Boolean).join(" ")} role="status" aria-live="polite">
      <span className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
      <h2 className="m-0 text-sm font-semibold text-ink">{label}</h2>
      {description && <p className="m-0 mt-1.5 max-w-md text-sm leading-6 text-subtle">{description}</p>}
    </div>
  );
}
