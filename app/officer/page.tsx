"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import type { ApplicationDTO, InstrumentDTO } from "@/packages/shared/types";

export default function OfficerPage() {
  const [applications, setApplications] = useState<ApplicationDTO[]>([]);
  const [instruments, setInstruments] = useState<Record<string, InstrumentDTO>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/applications").then((r) => r.json()),
      fetch("/api/v1/instruments").then((r) => r.json()),
    ])
      .then(([apps, insts]) => {
        if (apps?.data) setApplications(apps.data);
        if (insts?.data) {
          const map: Record<string, InstrumentDTO> = {};
          for (const item of insts.data) {
            map[item.id] = item;
          }
          setInstruments(map);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-0 sm:px-2">
      {/* Officer Queue Header */}
      <div className="mb-6 flex flex-col justify-between gap-2 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
              Inspection Queue
            </h1>
            <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-bold text-white dark:bg-white dark:text-zinc-900">
              {applications.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Legal Metrology Officer (LMO) / GATC verification workload
          </p>
        </div>
      </div>

      {/* Queue Items List (Optimized for 390px mobile viewports) */}
      <div className="space-y-3">
        {applications.map((app) => {
          const inst = instruments[app.instrumentId];
          const serial = inst?.serialNumber ?? (app.instrumentId === "ins_wb_9021" ? "WB-9021" : "CS-4412");
          const category = inst?.category ?? "WEIGHBRIDGE";
          const district = inst?.district ?? "Guntur";

          return (
            <div
              key={app.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-base font-bold text-zinc-900 dark:text-white">
                      {serial}
                    </span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {app.type}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {category} · {district}
                  </span>
                </div>
                <StatusChip status={app.status} />
              </div>

              <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-zinc-100 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
                <div className="text-[11px] text-zinc-500">
                  <span>App #{app.id}</span>
                  {app.preferredDate && (
                    <span className="ml-2 font-medium text-zinc-700 dark:text-zinc-300">
                      • Due: {new Date(app.preferredDate).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <Link
                  href={`/officer/job/${app.id}`}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 sm:w-auto sm:px-4 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  Open job →
                </Link>
              </div>
            </div>
          );
        })}

        {applications.length === 0 && !loading && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            No pending inspection jobs assigned to your queue.
          </div>
        )}
      </div>
    </div>
  );
}