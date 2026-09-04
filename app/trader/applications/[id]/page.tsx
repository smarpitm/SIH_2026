"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusChip } from "@/components/StatusChip";
import { api, ApiError } from "@/components/api-client";
import type { ApplicationDTO, InstrumentDTO } from "@/packages/shared/types";

// success path in frozen transition order (packages/shared/constants TRANSITIONS);
// FAILED / REJECTED are side states rendered as an extra red chip when current
const TIMELINE = ["DRAFT", "SUBMITTED", "SCHEDULED", "CHECKED_IN", "PASSED", "CERT_ISSUED"] as const;

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<ApplicationDTO | null>(null);
  const [serial, setSerial] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await api<ApplicationDTO>(`/api/v1/applications/${id}`);
      setApp(a);
      setErrorMsg(null);
      // resolve the instrument serial for a human-readable label (cuids are opaque)
      api<InstrumentDTO[]>("/api/v1/instruments")
        .then((list) => setSerial(list.find((i) => i.id === a.instrumentId)?.serialNumber ?? null))
        .catch(() => undefined);
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.message : "Failed to load application.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function reschedule() {
    setBusy(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await api<{ status: string; rescheduleCount: number; scheduledFor: string }>(
        `/api/v1/applications/${id}/reschedule`,
        { method: "POST", body: JSON.stringify({ reason }) }
      );
      setNotice(
        `Rescheduled — visit #${res.rescheduleCount} on ${new Date(res.scheduledFor).toLocaleDateString()}.`
      );
      setShowReschedule(false);
      setReason("");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESCHEDULE_BUDGET_EXHAUSTED") {
        setErrorMsg("Reschedule limit reached");
      } else {
        setErrorMsg(e instanceof ApiError ? e.message : "Reschedule failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const currentIndex = app ? TIMELINE.indexOf(app.status as (typeof TIMELINE)[number]) : -1;
  const isSideState = app ? app.status === "FAILED" || app.status === "REJECTED" : false;

  if (loading) {
    return <div className="py-12 text-center text-sm text-zinc-500">Loading application…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6">
        <Link
          href="/trader"
          className="mb-2 inline-flex items-center text-xs font-medium text-zinc-500 transition-colors hover:text-accent-700 dark:hover:text-accent-300"
        >
          ← Back to Trader Portal
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {serial ?? "Application"} · APP-{(app?.id ?? id).slice(-6).toUpperCase()}
          </h1>
          {app && <StatusChip status={app.status} />}
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
        >
          {errorMsg}
        </div>
      )}
      {notice && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300">
          ✓ {notice}
        </div>
      )}

      {app && (
        <>
          {/* Status Timeline */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Status Timeline
            </h2>
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
              {TIMELINE.map((s, i) => {
                const current = s === app.status;
                const done = !isSideState && i < currentIndex;
                return (
                  <li key={s} className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        current
                          ? "bg-zinc-950 text-white ring-2 ring-accent ring-offset-1 dark:bg-white dark:text-zinc-950 dark:ring-accent"
                          : done
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                      }`}
                    >
                      {s}
                    </span>
                    {i < TIMELINE.length - 1 && (
                      <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
                        →
                      </span>
                    )}
                  </li>
                );
              })}
              {isSideState && (
                <li className="flex items-center gap-2">
                  <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
                    →
                  </span>
                  <StatusChip status={app.status} />
                </li>
              )}
            </ol>
          </div>
          {/* Details */}
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Application Details
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">Instrument</dt>
                <dd className="font-mono text-zinc-900 dark:text-white">{serial ?? app.instrumentId}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">Type</dt>
                <dd className="text-zinc-900 dark:text-white">{app.type}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">Preferred Date</dt>
                <dd className="text-zinc-900 dark:text-white">
                  {app.preferredDate ? new Date(app.preferredDate).toLocaleDateString() : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">Fee Paid</dt>
                <dd className="text-zinc-900 dark:text-white">
                  {app.feePaidAt ? new Date(app.feePaidAt).toLocaleString() : "Not yet"}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">Created</dt>
                <dd className="text-zinc-900 dark:text-white">{new Date(app.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          {/* Reschedule (MA3 item 5) */}
          {app.status === "SCHEDULED" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-5 shadow-sm dark:border-amber-800/40 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Can&apos;t make the inspection slot?
                  </h2>
                  {/* ponytail: ApplicationDTO carries no rescheduleCount, so the button
                      shows for any SCHEDULED app and the server's budget (max 2) is the
                      authority — RESCHEDULE_BUDGET_EXHAUSTED surfaces as the limit message */}
                  <p className="mt-0.5 text-xs text-zinc-500">
                    You can reschedule up to 2 times per application.
                  </p>
                </div>
                {!showReschedule && (
                  <button
                    type="button"
                    onClick={() => setShowReschedule(true)}
                    className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 transition outline-none hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-accent dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  >
                    Request Reschedule
                  </button>
                )}
              </div>

              {showReschedule && (
                <div className="mt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Reason <span className="normal-case font-normal">(min 10 characters)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Officer unavailable on this date due to prior commitment"
                    className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowReschedule(false);
                        setReason("");
                      }}
                      className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 transition outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy || reason.trim().length < 10}
                      onClick={reschedule}
                      className="rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
                    >
                      {busy ? "Requesting…" : "Confirm Reschedule"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}