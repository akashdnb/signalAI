import type { ReactNode } from "react";

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center", className].filter(Boolean).join(" ")} role="alert">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-err bg-err text-err-ink" aria-hidden="true">
        !
      </div>
      <h2 className="m-0 text-base font-semibold text-ink">{title}</h2>
      {description && <p className="m-0 mt-2 max-w-md text-sm leading-6 text-subtle">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
