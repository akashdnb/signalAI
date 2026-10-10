const RADIUS_CLASSES = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
} as const;

export function Skeleton({
  className = "",
  rounded = "md",
}: {
  className?: string;
  rounded?: keyof typeof RADIUS_CLASSES;
}) {
  return <span className={["ui-skeleton block animate-pulse bg-chip", RADIUS_CLASSES[rounded], className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
