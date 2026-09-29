/**
 * Brand mark from docs/signalai-brand-assets/signalai-icon.svg, inlined
 * (rather than referenced as an <img>) so it can sit inline with the
 * "signal"+"AI" wordmark at any size without a network round-trip. The
 * wordmark itself is rendered as text, not the brand kit's flattened SVG
 * text, so "signal" can track the current surface's ink color (light/dark)
 * while "AI" stays the fixed brand purple, matching every wordmark variant
 * in the brand kit.
 */
const SIZES = {
  sm: { icon: 22, text: "text-base" },
  md: { icon: 28, text: "text-lg" },
  lg: { icon: 40, text: "text-2xl" },
} as const;

export function Logo({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const { icon, text } = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={icon} height={icon} viewBox="0 0 512 512" aria-hidden="true" className="shrink-0">
        <defs>
          <linearGradient id="signalai-logo-gradient" x1="80" y1="430" x2="430" y2="70" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#22D3EE" />
            <stop offset=".45" stopColor="#2563EB" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        <path
          fill="url(#signalai-logo-gradient)"
          d="M320 62c-70 5-134 38-168 86-30 42-22 79 23 102l83 42c18 9 19 22 2 37-25 22-67 34-113 32l-45 66c88 9 174-18 220-70 40-46 38-90-15-118l-82-43c-19-10-18-23 3-39 24-19 61-29 104-28l42-67z"
        />
        <path fill="#7C3AED" d="M402 57l9 24 24 9-24 9-9 24-9-24-24-9 24-9z" />
      </svg>
      <span className={`font-bold ${text} text-ink`}>
        signal<span className="text-accent">AI</span>
      </span>
    </span>
  );
}
