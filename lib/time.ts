// lib/time.ts — centralized business-timezone date helpers (audit findings
// #15, #36, #38). The domain is India-focused; all "today"/"this month"
// boundaries for validation and dashboards are computed in the business
// timezone instead of the server's UTC clock.

export const BUSINESS_TIMEZONE = "Asia/Kolkata";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function businessDateParts(date: Date): { y: number; m: number; d: number } {
  const [y, m, d] = partsFmt.format(date).split("-").map(Number);
  return { y, m, d };
}

/** Offset (ms) of BUSINESS_TIMEZONE at the given instant (handles DST zones). */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  );
  return asUtc - date.getTime();
}

/** Midnight (00:00) of "today" in the business timezone, as a UTC instant. */
export function startOfBusinessToday(now: Date = new Date()): Date {
  const { y, m, d } = businessDateParts(now);
  const naive = Date.UTC(y, m - 1, d);
  return new Date(naive - tzOffsetMs(new Date(naive), BUSINESS_TIMEZONE));
}

/** First day of "this month" in the business timezone, as a UTC instant. */
export function startOfBusinessMonth(now: Date = new Date()): Date {
  const { y, m } = businessDateParts(now);
  const naive = Date.UTC(y, m - 1, 1);
  return new Date(naive - tzOffsetMs(new Date(naive), BUSINESS_TIMEZONE));
}

/** First day of the month AFTER "this month" in the business timezone. */
export function startOfBusinessNextMonth(now: Date = new Date()): Date {
  // +32 days always lands in the next month (shortest month is 28 days)
  return startOfBusinessMonth(new Date(now.getTime() + 32 * 86_400_000));
}

/** Midnight (00:00) of "tomorrow" in the business timezone, as a UTC instant. */
export function startOfBusinessTomorrow(now: Date = new Date()): Date {
  return startOfBusinessToday(new Date(now.getTime() + 24 * 86_400_000));
}

/** Midnight (00:00) of the business-timezone day CONTAINING the given instant.
 *  A trader picks a DATE only (no time slot), so every stored schedule anchor
 *  is normalized through here — storing a raw UTC-midnight pick ("T00:00Z")
 *  drifted to 05:30 IST and read as a meaningless time-of-day on the LMO clip.
 *  Idempotent: an already-normalized instant maps to itself. */
export function startOfBusinessDay(date: Date): Date {
  return startOfBusinessToday(date);
}

/** "YYYY-MM-DD" of an instant in the business timezone (browser-safe — Intl
 *  with an explicit timeZone). Lexical string compare == chronological compare,
 *  so the officer queue buckets Today / Upcoming / Past on the same calendar
 *  date the server uses, regardless of the viewer's local timezone. */
export function businessDateKey(date: Date = new Date()): string {
  return partsFmt.format(date);
}

/** Formats an instant as a business-timezone DATE so every viewer — whatever
 *  their local timezone — sees the SAME calendar day the trader picked. */
export function formatBusinessDate(date: Date, style: "long" | "medium" | "short" = "medium"): string {
  return new Intl.DateTimeFormat([], {
    timeZone: BUSINESS_TIMEZONE,
    dateStyle: style,
  }).format(date);
}
