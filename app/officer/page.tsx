"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge, EmptyState, SkeletonCardRow } from "@/components/ui";
import { api } from "@/components/api-client";
import { useTranslation } from "@/lib/i18n";
import type { InstrumentDTO } from "@/packages/shared/types";

// GET /schedule/mine row (MA3) — shape local to the UI
interface ScheduleJob {
  id: string;
  applicationId: string;
  scheduledFor: string;
  rescheduleCount: number;
  status: string;
  // AUDIT FINDING #112: the badge should show WHERE THE APPLICATION IS
  // (SCHEDULED vs CHECKED_IN) — the schedule status alone reads as static.
  appStatus?: string;
  overdue: boolean;
  instrumentCategory: string;
  instrumentSerial: string;
  traderName: string | null;
  traderOrg: string | null;
}

export default function OfficerPage() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [districts, setDistricts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<ScheduleJob[]>("/api/v1/schedule/mine"),
      api<InstrumentDTO[]>("/api/v1/instruments"),
    ])
      .then(([mine, insts]) => {
        setJobs(mine);
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

  // Search + district filter (kept deliberately simple: one search box, one
  // select — the full filter matrix would overwhelm a field-officer screen).
  const [query, setQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("ALL");
  const districtOptions = Array.from(
    new Set(jobs.map((j) => districts[j.instrumentSerial]).filter(Boolean))
  );
  const matches = (j: ScheduleJob) => {
    if (districtFilter !== "ALL" && districts[j.instrumentSerial] !== districtFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      j.instrumentSerial.toLowerCase().includes(q) ||
      (j.traderName ?? "").toLowerCase().includes(q) ||
      (j.traderOrg ?? "").toLowerCase().includes(q) ||
      `app-${j.applicationId.slice(-6).toLowerCase()}`.includes(q)
    );
  };
  const filtered = (list: ScheduleJob[]) => list.filter(matches);
  const fOverdue = filtered(overdue);
  const fToday = filtered(today);
  const fUpcoming = filtered(upcoming);

  function JobCard({ job }: { job: ScheduleJob }) {
    const overdueCard = job.overdue;
    return (
      <div
        className={`rounded-xl border bg-white p-4 shadow-md shadow-zinc-950/5 transition dark:bg-zinc-900 dark:shadow-black/20 ${
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
                  {t("officer.overdue")}
                </span>
              )}
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {job.traderName ?? job.traderOrg ?? t("officer.traderWord")} · {districts[job.instrumentSerial] ?? "—"}
            </span>
            <span className="text-xs text-zinc-500">
              {t("common.application")} <span className="font-mono">APP-{job.applicationId.slice(-6).toUpperCase()}</span>
              {job.rescheduleCount > 0 && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  · {t("officer.rescheduledX")} ×{job.rescheduleCount}
                </span>
              )}
            </span>
          </div>
          {/* AUDIT FINDING #112: badge the application status (falls back to the
              schedule status for old payloads without appStatus) */}
          <StatusBadge status={job.appStatus ?? job.status} />
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div className="text-[11px] text-zinc-500">
            {t("officer.scheduled")}{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {new Date(job.scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          {/* the primary action must dominate the secondary metadata (review): full-height
              Inspect CTA, monospace serial echoed so the officer confirms the right job */}
          <Link
            href={`/officer/job/${job.applicationId}?scheduleId=${job.id}`}
            className="btn btn-primary w-full sm:w-auto sm:min-w-36"
          >
            {t("officer.inspect", "Inspect")} →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-0 sm:px-2">
      {/* Officer Queue Header */}
      <div className="mb-6 flex flex-col justify-between gap-2 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
              {t("officer.title")}
            </h1>
            <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs font-bold text-white dark:bg-white dark:text-zinc-950">
              {active.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {t("officer.subtitle")}
            {doneCount > 0 && ` · ${doneCount} ${t("officer.completed")}`}
          </p>
        </div>
      </div>

      {/* Today's Work — the officer answers "what do I do now?" in one glance:
          a big pending count plus the Urgent / Scheduled / Review breakdown. */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-4">
              <div className="skeleton h-8 w-12" />
              <div className="skeleton mt-1 h-3 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t("officer.todayWork", "Today's Work")}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-zinc-950 dark:text-white">
                {active.length}
              </span>
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {t("officer.inspectionsPending", "Inspections Pending")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800/60">
              <span aria-hidden="true">◉</span> {t("officer.urgent", "Urgent")} {overdue.length}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/60">
              <span aria-hidden="true">●</span> {t("officer.scheduledChip", "Scheduled")} {today.length}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700">
              <span aria-hidden="true">○</span> {t("officer.review", "Review")} {upcoming.length}
            </span>
          </div>
        </div>
      )}

      {/* Inspection Queue — the actionable list itself, after Today's Work */}
      {!loading && active.length > 0 && (
        <div className="flex items-baseline justify-between gap-2 pt-1">
          <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
            {t("officer.queueTitle", "Inspection Queue")}
          </h2>
          <span className="text-xs text-zinc-500">
            {t("officer.filterHint", "Search or filter below")}
          </span>
        </div>
      )}

      {/* Search + district filter */}
      {!loading && jobs.length > 0 && (
        <div className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
              ⌕
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("officer.searchPh", "Search serial no., trader, or APP id…")}
              aria-label={t("officer.search", "Search inspections")}
              className="field-input pl-8"
            />
          </div>
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            aria-label={t("officer.filterDistrict", "Filter by district")}
            className="field-input sm:w-48"
          >
            <option value="ALL">{t("officer.allDistricts", "All Districts")}</option>
            {districtOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && (
        <div className="space-y-3" aria-hidden="true">
          <SkeletonCardRow />
          <SkeletonCardRow />
          <SkeletonCardRow />
        </div>
      )}

      {!loading && active.length === 0 && (
        <EmptyState
          icon="◉"
          title={t("officer.emptyTitle", "No Pending Inspections")}
          description={t(
            "officer.emptyDesc",
            "Inspection jobs assigned to you will appear here as traders submit applications."
          )}
        />
      )}

      {!loading && active.length > 0 && fOverdue.length + fToday.length + fUpcoming.length === 0 && (
        <EmptyState
          icon="⌕"
          title={t("officer.noMatchTitle", "No Matching Inspections")}
          description={t("officer.noMatchDesc", "Try a different search term or clear the district filter.")}
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setQuery("");
                setDistrictFilter("ALL");
              }}
            >
              {t("officer.clearFilters", "Clear Filters")}
            </button>
          }
        />
      )}

      <div className="space-y-3">
        {fOverdue.length > 0 && (
          <>
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              {t("officer.overdueAct")}
            </h2>
            {/* review: at 1440px two columns halve the vertical pile-up */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {fOverdue.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          </>
        )}
        {fToday.length > 0 && (
          <>
            <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t("officer.today")}
            </h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {fToday.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          </>
        )}
        {fUpcoming.length > 0 && (
          <>
            <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t("officer.upcoming")}
            </h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {fUpcoming.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}