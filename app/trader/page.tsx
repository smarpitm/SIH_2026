"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { CountdownRing } from "@/components/CountdownRing";
import { api } from "@/components/api-client";
import type { DashCounts, InstrumentDTO, ApplicationDTO } from "@/packages/shared/types";

export default function TraderPage() {
  const [dash, setDash] = useState<DashCounts | null>(null);
  const [instruments, setInstruments] = useState<InstrumentDTO[]>([]);
  const [applications, setApplications] = useState<ApplicationDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<DashCounts>("/api/v1/dashboards/trader"),
      api<InstrumentDTO[]>("/api/v1/instruments"),
      api<ApplicationDTO[]>("/api/v1/applications"),
    ])
      .then(([d, i, a]) => {
        setDash(d);
        setInstruments(i);
        setApplications(a);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  // Mock fraction map: 0.9 (green), 0.5 (amber), 0.1 (red) for demo
  const mockFractions = [0.9, 0.5, 0.1, 0.85, 0.4, 0.15];

  // Helper status for instruments
  const getInstrumentStatus = (index: number) => {
    if (index === 0) return "PASSED";
    if (index === 1) return "CHECKED_IN";
    return "SCHEDULED";
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
            Trader Portal
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage your weighing &amp; measuring instruments, track validity, and submit verification applications.
          </p>
        </div>
        <Link
          href="/trader/instruments/new"
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          + Add Instrument
        </Link>
      </div>

      {/* KPI Cards & Instrument Validity Ring Row */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Instrument Certificate Validity &amp; Status
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          {instruments.map((ins, idx) => {
            const frac = mockFractions[idx % mockFractions.length];
            const status = frac > 0.6 ? "ACTIVE" : frac > 0.25 ? "EXPIRING_SOON" : "EXPIRED";
            return (
              <div
                key={ins.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-base font-bold text-zinc-900 dark:text-white">
                    {ins.serialNumber}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {ins.category} · {ins.capacity}
                  </span>
                  <div className="mt-1">
                    <StatusChip status={status} />
                  </div>
                </div>
                <div className="pl-4">
                  <CountdownRing fraction={frac} size={74} label="Validity" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Stat Grid */}
      {dash && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {dash.pendingApplications}
            </div>
            <div className="text-xs text-zinc-500">Pending Applications</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {dash.verifiedThisMonth}
            </div>
            <div className="text-xs text-zinc-500">Verified This Month</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-bold text-amber-500 dark:text-amber-400">
              {dash.expiringIn30d}
            </div>
            <div className="text-xs text-zinc-500">Expiring in 30 Days</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-bold text-rose-500 dark:text-rose-400">
              {dash.slaBreaches}
            </div>
            <div className="text-xs text-zinc-500">SLA Breaches</div>
          </div>
        </div>
      )}

      {/* Instruments Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/75 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            Registered Instruments
          </h2>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {instruments.length} total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/25 dark:text-zinc-400">
              <tr>
                <th className="px-5 py-3">Serial Number</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Make / Model</th>
                <th className="px-5 py-3">District / Address</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {instruments.map((ins, idx) => (
                <tr key={ins.id} className="transition hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3.5 font-mono font-semibold text-zinc-900 dark:text-white">
                    {ins.serialNumber}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-700 dark:text-zinc-300">
                    {ins.category}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-400">
                    {ins.make} {ins.model} ({ins.capacity})
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{ins.district}</span>
                    <span className="block text-xs text-zinc-400">{ins.address}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusChip status={getInstrumentStatus(idx)} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/trader/apply/${ins.id}`}
                      className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                    >
                      Apply →
                    </Link>
                  </td>
                </tr>
              ))}
              {instruments.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-zinc-500">
                    No instruments registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Applications List */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/75 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            Verification Applications
          </h2>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {applications.length} submitted
          </span>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {applications.map((app) => (
            <div
              key={app.id}
              className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:px-5 sm:py-3.5"
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-white">
                    App #{app.id}
                  </span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {app.type}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">
                  Target Instrument: <span className="font-mono">{app.instrumentId}</span>
                </span>
              </div>

              <div className="flex items-center gap-4">
                {app.preferredDate && (
                  <span className="text-xs text-zinc-500">
                    Preferred: {new Date(app.preferredDate).toLocaleDateString()}
                  </span>
                )}
                <StatusChip status={app.status} />
              </div>
            </div>
          ))}
          {applications.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-zinc-500">
              No verification applications submitted yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}