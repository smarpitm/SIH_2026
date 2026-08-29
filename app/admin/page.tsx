"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api-client";
import type { DashCounts } from "@/packages/shared/types";

const KPIS: { key: keyof DashCounts; label: string; desc: string; color: string }[] = [
  { key: "pendingApplications", label: "Pending Applications", desc: "Awaiting inspection assignment", color: "text-zinc-900 dark:text-white" },
  { key: "verifiedThisMonth", label: "Verified This Month", desc: "Certificates actively issued", color: "text-emerald-600 dark:text-emerald-400" },
  { key: "expiringIn30d", label: "Expiring in 30 Days", desc: "Mandatory renewal window", color: "text-amber-500 dark:text-amber-400" },
  { key: "slaBreaches", label: "SLA Breaches", desc: "Exceeded 14-day turnaround", color: "text-rose-600 dark:text-rose-400" },
];

export default function AdminPage() {
  const [dash, setDash] = useState<DashCounts | null>(null);

  useEffect(() => {
    api<DashCounts>("/api/v1/dashboards/admin")
      .then(setDash)
      .catch(() => undefined);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
          State / District Administration
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          State-wide Legal Metrology verification throughput, SLA compliance metrics, and district oversight.
        </p>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => (
          <div
            key={k.key}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className={`text-3xl font-black ${k.color}`}>
              {dash ? dash[k.key] : "–"}
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {k.label}
            </div>
            <div className="mt-0.5 text-xs text-zinc-400">
              {k.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Administrative Seams & Actions */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-2">
            Jurisdiction Health &amp; Allocations
          </h2>
          <p className="text-xs text-zinc-500 mb-4">
            Manage officer jurisdictions and load balancing across districts (Guntur, Krishna, Vijayawada).
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/40">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">Guntur District</span>
              <span className="text-emerald-600 font-medium">Active (LMO Guntur)</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/40">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">Krishna District</span>
              <span className="text-emerald-600 font-medium">Active (LMO Krishna)</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/40">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">Vijayawada GATC Centre</span>
              <span className="text-emerald-600 font-medium">Active (GATC Lab)</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-2">
            Audit Trail &amp; Reports Export
          </h2>
          <p className="text-xs text-zinc-500 mb-4">
            Download statutory compliance CSV exports and review Ed25519 digital signature keys.
          </p>
          <div className="space-y-3">
            <Link
              href="/api/v1/reports/export"
              target="_blank"
              className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <span>📊 Download Compliance CSV Report</span>
              <span>↓</span>
            </Link>
            <Link
              href="/api/v1/.well-known/pramanam-public-key"
              target="_blank"
              className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <span>🔑 View Ed25519 Public Key Certificate</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}