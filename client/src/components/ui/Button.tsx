import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "border border-transparent bg-accent text-white hover:bg-accent-hover focus-visible:outline-accent",
  secondary: "border border-line bg-card text-ink hover:bg-chip",
  ghost: "border border-transparent bg-transparent text-ink hover:bg-chip",
  danger: "border border-transparent bg-err text-err-ink hover:opacity-90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-8 gap-1.5 rounded-md px-3 text-xs",
  md: "min-h-10 gap-2 rounded-lg px-3.5 text-sm",
  lg: "min-h-11 gap-2 rounded-lg px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * Shared SignalAI button primitive for new/modernized surfaces.
 * Existing legacy button classes remain supported to keep this rollout additive.
 */
export function Button({
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  type = "button",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center whitespace-nowrap font-semibold transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? "w-full" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
