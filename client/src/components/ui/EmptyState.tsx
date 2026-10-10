import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center", className].filter(Boolean).join(" ")}>
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-card text-accent shadow-sm">
          {icon}
        </div>
      )}
      <h2 className="m-0 text-base font-semibold text-ink">{title}</h2>
      {description && <p className="m-0 mt-2 max-w-md text-sm leading-6 text-subtle">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
