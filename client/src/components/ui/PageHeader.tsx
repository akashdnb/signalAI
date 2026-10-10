import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={["mb-6 flex flex-wrap items-start justify-between gap-4", className].filter(Boolean).join(" ")}>
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.09em] text-subtle">{eyebrow}</div>}
        <h1 className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.035em] text-ink md:text-[32px]">{title}</h1>
        {description && <p className="m-0 mt-2 max-w-3xl text-sm leading-6 text-subtle md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </header>
  );
}
