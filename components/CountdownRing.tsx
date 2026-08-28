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
  size = 96,
}: {
  validFrom?: string;
  validUntil: string;
  size?: number;
}) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const fraction = computeFraction(validFrom, validUntil);
  const offset = C * (1 - fraction);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="inline-block" role="img" aria-label={`${Math.round(fraction * 100)}% validity remaining`}>
      <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="8" />
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
      <text x="50" y="54" textAnchor="middle" fontSize="16" fontWeight="700">
        {Math.round(fraction * 100)}%
      </text>
    </svg>
  );
}