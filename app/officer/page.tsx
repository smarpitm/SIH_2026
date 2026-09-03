"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { api } from "@/components/api-client";
import type { InstrumentDTO } from "@/packages/shared/types";

// GET /schedule/mine row (MA3) — shape local to the UI
interface ScheduleJob {
  id: string;
  applicationId: string;
  scheduledFor: string;
  rescheduleCount: number;
  status: string;
  overdue: boolean;
  instrumentCategory: string;
  instrumentSerial: string;
  traderName: string | null;
  traderOrg: string | null;
}

// GET /dashboards/officer (MA4) — consumed if present, never required
type OfficerDash = { todaySchedule?: unknown[]; overdueCount?: number } | null;

export default function OfficerPage() {
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [districts, setDistricts] = useState<Record<string, string>>({});
  const [officerDash, setOfficerDash] = useState<OfficerDash>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<ScheduleJob[]>("/api/v1/schedule/mine"),
      api<InstrumentDTO[]>("/api/v1/instruments"),
      api<NonNullable<OfficerDash>>("/api/v1/dashboards/officer").catch(() => null),
    ])
      .then(([mine, insts, d]) => {
        setJobs(mine);
        setOfficerDash(d);
        // schedule/mine carries no district — resolve it via serial from the
        // jurisdiction-scoped instruments list (both are officer-scoped)
        const map: Record<string, string> = {};
        for (const i of insts) map[i.serialNumber] = i.district;
        setDistricts(map);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  // queue = actionable jobs; DONE stays behind as a count
  const active = jobs.filter((j) => j.status !== "DONE");
  const doneCount = jobs.length - active.length;
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const overdue = active.filter((j) => j.overdue);
  const today = active.filter((j) => !j.overdue && isToday(j.scheduledFor));
  const upcoming = active.filter((j) => !j.overdue && !isToday(j.scheduledFor));

  function JobCard({ job }: { job: ScheduleJob }) {
    const overdueCard = job.overdue;
    return (
      <div
        className={`rounded-xl border bg-white p-4 shadow-sm transition dark:bg-zinc-900 ${
          overdueCard
            ? "border-red-300 ring-1 ring-red-200 dark:border-red-800 dark:ring-red-900/40"
            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-bold text-zinc-900 dark:text-white">
                {job.instrumentSerial}
              </span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {job.instrumentCategory}
              </span>
              {overdueCard && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  Overdue
                </span>
              )}
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {job.traderName ?? job.traderOrg ?? "Trader"} · {districts[job.instrumentSerial] ?? "—"}
            </span>
            <span className="text-xs text-zinc-500">
              Application <span className="font-mono">APP-{job.applicationId.slice(-6).toUpperCase()}</span>
              {job.rescheduleCount > 0 && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  · rescheduled ×{job.rescheduleCount}
                </span>
              )}
            </span>
          </div>
          <StatusChip status={job.status} />
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div className="text-[11px] text-zinc-500">
            🕒 Scheduled:{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {new Date(job.scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          <Link
            href={`/officer/job/${job.applicationId}?scheduleId=${job.id}`}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-zinc-900 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 sm:w-auto sm:px-4 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            Open job →
          </Link>
        </div>
      </div>
    );
  }

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
              {active.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Your assigned field jobs — overdue pinned first
            {doneCount > 0 && ` · ${doneCount} completed`}
          </p>
          {/* MA4 dashboard fields, shown only when the payload includes them */}
          {officerDash && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {officerDash.todaySchedule && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Today&rsquo;s schedule: {officerDash.todaySchedule.length}
                </span>
              )}
              {typeof officerDash.overdueCount === "number" && (
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold ${
                    officerDash.overdueCount > 0
                      ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  }`}
                >
                  Overdue: {officerDash.overdueCount}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {loading && <div className="py-12 text-center text-sm text-zinc-500">Loading queue…</div>}

      {!loading && active.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          No inspection jobs assigned to your queue yet.
        </div>
      )}

      <div className="space-y-3">
        {overdue.length > 0 && (
          <>
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              Overdue — act now
            </h2>
            {overdue.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </>
        )}
        {today.length > 0 && (
          <>
            <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Today
            </h2>
            {today.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </>
        )}
        {upcoming.length > 0 && (
          <>
            <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Upcoming
            </h2>
            {upcoming.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}