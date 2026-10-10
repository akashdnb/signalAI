export function Skeleton({
  className = "",
  rounded = "md",
}: {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}) {
  return <span className={["ui-skeleton block animate-pulse bg-chip", `rounded-${rounded}`, className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
