import type { ComponentType, ReactNode } from "react";

export type NodeAccent =
  | "pink"
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "neutral";

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
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`w-[260px] max-w-[calc(100vw-36px)] cursor-pointer rounded-xl border border-l-4 bg-card p-3.5 text-left shadow-[0_4px_14px_rgba(15,23,42,0.06)] transition-shadow ${
        ACCENT_BORDER[accent]
      } ${
        selected
          ? "border-accent shadow-md ring-1 ring-accent"
          : "border-line hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ACCENT_ICON_BG[accent]}`}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="truncate text-[13px] font-semibold leading-5 text-ink">
              {title}
            </div>
            {menu}
          </div>

          {subtitle && (
            <div className="mt-0.5 text-[11px] leading-4 text-subtle">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {children && (
        <div className="mt-2 text-[11px] leading-4 text-subtle">
          {children}
        </div>
      )}
    </div>
  );
}
