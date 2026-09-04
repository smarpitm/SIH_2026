"use client";

import { useTranslation } from "@/lib/i18n";

const COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-purple-100 text-purple-700",
  CHECKED_IN: "bg-cyan-100 text-cyan-700",
  PASSED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  CERT_ISSUED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

export function StatusChip({ status }: { status: string }) {
  const { t } = useTranslation();
  const cls = COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {t(`status.${status}`, status)}
    </span>
  );
}