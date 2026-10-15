import type { HTMLAttributes, ReactNode } from "react";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-line bg-chip text-subtle",
  success: "border-ok/25 bg-ok text-ok-ink",
  warning: "border-warn-line bg-warn text-warn-ink",
  danger: "border-err/25 bg-err text-err-ink",
  info: "border-line bg-info text-info-ink",
  accent: "border-accent/20 bg-chip text-accent",
};

export function StatusBadge({
  tone = "neutral",
  dot = false,
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        TONE_CLASSES[tone],
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
