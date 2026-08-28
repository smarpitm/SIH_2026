"use client";

function computeFraction(validFrom: string | undefined, validUntil: string): number {
  // Countdown = remaining validity / total validity.
  // stroke-dashoffset = circumference * (1 - fraction) so the ring drains as cert ages.
  const end = new Date(validUntil).getTime();
  const start = validFrom ? new Date(validFrom).getTime() : Date.now();
  const total = end - start;
  const remaining = end - Date.now();
  if (!Number.isFinite(remaining) || total <= 0) return 0;
  return Math.max(0, Math.min(1, remaining / total));
}

export function CountdownRing({
  validFrom,
  validUntil,
  fraction: directFraction,
  size = 76,
  label,
}: {
  validFrom?: string;
  validUntil?: string;
  fraction?: number;
  size?: number;
  label?: string;
}) {
  const R = 38;
  const C = 2 * Math.PI * R;
  const fraction =
    typeof directFraction === "number"
      ? Math.max(0, Math.min(1, directFraction))
      : validUntil
      ? computeFraction(validFrom, validUntil)
      : 0.75;

  const offset = C * (1 - fraction);

  // Color mapping: green (>0.6) / amber (0.25 - 0.6) / red (<0.25)
  const colorClass =
    fraction > 0.6
      ? "text-emerald-500 dark:text-emerald-400"
      : fraction > 0.25
      ? "text-amber-500 dark:text-amber-400"
      : "text-rose-500 dark:text-rose-400";

  return (
    <div className="flex flex-col items-center justify-center gap-1.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className={`inline-block ${colorClass}`}
        role="img"
        aria-label={`${Math.round(fraction * 100)}% validity remaining`}
      >
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
        <text
          x="50"
          y="55"
          textAnchor="middle"
          fontSize="17"
          fontWeight="700"
          fill="currentColor"
        >
          {Math.round(fraction * 100)}%
        </text>
      </svg>
      {label && (
        <span className="max-w-[100px] truncate text-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {label}
        </span>
      )}
    </div>
  );
}