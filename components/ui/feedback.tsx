"use client";

// components/ui/feedback.tsx — Alert, ConfirmationModal, skeletons, and the
// OFFLINE/ONLINE connection indicator. Errors explain what happened and what
// to do next; offline mode is a normal mode, never an error.

import { useTranslation } from "@/lib/i18n";
import { useEffect } from "react";

const ALERT_STYLES: Record<string, string> = {
  info: "border-blue-200 bg-blue-50/70 text-blue-800 dark:border-blue-800/40 dark:bg-blue-950/40 dark:text-blue-300",
  success:
    "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-300",
  error:
    "border-rose-200 bg-rose-50/70 text-rose-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-300",
};
const ALERT_ICONS: Record<string, string> = { info: "ℹ", success: "✓", warning: "⚠", error: "✕" };

/* Alert — inline banner for notices, validation errors, outcomes. */
export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border p-3 text-xs ${ALERT_STYLES[tone]}`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="font-bold">
          {ALERT_ICONS[tone]}
        </span>
        <div className="min-w-0 flex-1">
          {title && <div className="font-bold">{title}</div>}
          {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}

/* ConfirmationModal — explicit confirm for irreversible actions. */
export function ConfirmationModal({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "success" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, busy, onCancel]);

  if (!open) return null;
  const confirmCls =
    tone === "danger" ? "btn-danger" : tone === "success" ? "btn-success" : "btn-primary";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pm-confirm-title"
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div className="card w-full max-w-md p-6 shadow-xl">
        <h2 id="pm-confirm-title" className="text-base font-bold text-zinc-950 dark:text-white">
          {title}
        </h2>
        {children && (
          <div className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {children}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${confirmCls}`} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Skeleton primitives — never show blank content while data loads. */
export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton h-4 ${className}`} aria-hidden="true" />;
}

export function SkeletonCardRow() {
  return (
    <div className="card flex items-center justify-between p-4" aria-hidden="true">
      <div className="flex-1 space-y-2">
        <SkeletonLine className="w-1/3" />
        <SkeletonLine className="w-1/2" />
      </div>
      <div className="skeleton h-6 w-20 rounded-full" />
    </div>
  );
}

/* ConnectionBadge — OFFLINE / ONLINE indicator for the offline verifier. */
export function ConnectionBadge({ online }: { online: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${
        online
          ? "bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-700"
          : "bg-blue-50 text-blue-700 ring-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-700"
      }`}
    >
      <span aria-hidden="true" className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
            online ? "animate-ping bg-emerald-500" : "bg-blue-500"
          }`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            online ? "bg-emerald-600" : "bg-blue-600"
          }`}
        />
      </span>
      {online ? t("conn.online", "ONLINE") : t("conn.offline", "OFFLINE")}
    </span>
  );
}
