import type { ComponentType, ReactNode } from "react";

export type NodeAccent = "pink" | "blue" | "green" | "purple" | "orange" | "neutral";

const ACCENT_BORDER: Record<NodeAccent, string> = {
  pink: "border-l-[#EC4899]",
  blue: "border-l-[#2563EB]",
  green: "border-l-[#16A34A]",
  purple: "border-l-accent",
  orange: "border-l-[#F59E0B]",
  neutral: "border-l-ink",
};

const ACCENT_ICON_BG: Record<NodeAccent, string> = {
  pink: "bg-[#FCE7F3] text-[#DB2777]",
  blue: "bg-[#DBEAFE] text-[#2563EB]",
  green: "bg-[#DCFCE7] text-[#16A34A]",
  purple: "bg-chip text-accent",
  orange: "bg-[#FEF3C7] text-[#B45309]",
  neutral: "bg-chip text-ink",
};

export function BuilderNode({
  icon: Icon,
  accent,
  title,
  subtitle,
  selected,
  onClick,
  menu,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  accent: NodeAccent;
  title: string;
  subtitle?: string;
  selected: boolean;
  onClick: () => void;
  menu?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`w-full max-w-[420px] min-h-[68px] cursor-pointer rounded-xl border border-l-4 bg-card p-3.5 text-left shadow-sm transition-shadow ${
        ACCENT_BORDER[accent]
      } ${selected ? "border-accent shadow-md ring-1 ring-accent" : "border-line hover:shadow-md"}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ACCENT_ICON_BG[accent]}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-semibold text-ink">{title}</div>
            {menu}
          </div>
          {subtitle && <div className="mt-0.5 text-xs text-subtle">{subtitle}</div>}
        </div>
      </div>
      {children && <div className="mt-2 text-xs leading-relaxed text-subtle">{children}</div>}
    </div>
  );
}

export function NodeConnector() {
  return (
    <div className="flex flex-col items-center py-0.5" aria-hidden="true">
      <div className="h-6 w-0.5 rounded-full bg-subtle" />
      <svg width="12" height="7" viewBox="0 0 12 7" className="-mt-px text-subtle">
        <path d="M1 0.5 6 6 11 0.5" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
