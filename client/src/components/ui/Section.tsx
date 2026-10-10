import type { HTMLAttributes, ReactNode } from "react";

export function Section({
  title,
  description,
  actions,
  divided = false,
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={[
        "min-w-0",
        divided ? "border-b border-line pb-6 last:border-b-0 last:pb-0" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      {(title || description || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="m-0 text-base font-semibold leading-6 tracking-[-0.01em] text-ink">{title}</h2>}
            {description && <p className="m-0 mt-1 max-w-3xl text-sm leading-5 text-subtle">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
