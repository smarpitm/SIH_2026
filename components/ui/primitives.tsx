"use client";

// components/ui/primitives.tsx — atomic design-system pieces (SIH26036).
// Government/enterprise tone: icon + word always (never colour-only status),
// restrained shadows, tabular numerals for metrics, EN/HI via t(key, fallback).

import { useTranslation } from "@/lib/i18n";

export type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  info: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800/60",
  progress:
    "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-800/60",
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800/60",
  warning:
    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800/60",
  danger: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800/60",
};

export const VALUE_TONES: Record<Tone, string> = {
  neutral: "text-zinc-900 dark:text-white",
  info: "text-blue-600 dark:text-blue-400",
  progress: "text-violet-600 dark:text-violet-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-500 dark:text-amber-400",
  danger: "text-rose-500 dark:text-rose-400",
};

const STATUS_MAP: Record<string, { tone: Tone; icon: string }> = {
  DRAFT: { tone: "neutral", icon: "○" },
  SUBMITTED: { tone: "info", icon: "◎" },
  SCHEDULED: { tone: "progress", icon: "◷" },
  CHECKED_IN: { tone: "progress", icon: "◉" },
  PASSED: { tone: "success", icon: "✓" },
  FAILED: { tone: "danger", icon: "✕" },
  CERT_ISSUED: { tone: "success", icon: "✓" },
  ACTIVE: { tone: "success", icon: "✓" },
  VALID: { tone: "success", icon: "✓" },
  VERIFIED: { tone: "success", icon: "✓" },
  REJECTED: { tone: "danger", icon: "✕" },
  EXPIRED: { tone: "danger", icon: "✕" },
  REVOKED: { tone: "danger", icon: "✕" },
  EXPIRING_SOON: { tone: "warning", icon: "⟳" },
  PENDING: { tone: "warning", icon: "…" },
  UNDER_REVIEW: { tone: "info", icon: "◎" },
  NO_CERTIFICATE: { tone: "neutral", icon: "—" },
  // AUDIT FINDING #112: schedule-level statuses rendered in the officer queue —
  // without these every job card fell back to the neutral grey pill.
  ASSIGNED: { tone: "info", icon: "◷" },
  RESCHEDULED: { tone: "warning", icon: "⟳" },
  DONE: { tone: "success", icon: "✓" },
};

/* StatusBadge — unified status pill across the whole app. */
export function StatusBadge({
  status,
  label,
  size = "md",
  className = "",
}: {
  status: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useTranslation();
  const m = STATUS_MAP[status] ?? { tone: "neutral" as Tone, icon: "●" };
  const text = label ?? t(`status.${status}`, status);
  return (
    <span
      title={text}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"
      } ${TONES[m.tone]} ${className}`}
    >
      <span aria-hidden="true">{m.icon}</span>
      {text}
    </span>
  );
}

/* MetricCard — top-of-dashboard KPI tile with optional loading skeleton. */
export function MetricCard({
  label,
  value,
  tone = "neutral",
  hint,
  loading = false,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="card p-4">
      {loading ? (
        <div className="skeleton h-8 w-12" aria-hidden="true" />
      ) : (
        <div className={`text-2xl font-bold tabular-nums ${VALUE_TONES[tone]}`}>{value}</div>
      )}
      <div className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</div>}
    </div>
  );
}
