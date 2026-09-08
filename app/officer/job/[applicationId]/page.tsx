"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { OBSERVATION_CONFIG } from "@/packages/shared/constants";
import { api, ApiError } from "@/components/api-client";
import { ConfirmationModal } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";
import type { ApplicationDTO, InstrumentDTO } from "@/packages/shared/types";

function JobPageInner() {
  const { t } = useTranslation();
  const { applicationId } = useParams<{ applicationId: string }>();
  const scheduleId = useSearchParams().get("scheduleId");
  const fields = OBSERVATION_CONFIG.default;

  const [app, setApp] = useState<ApplicationDTO | null>(null);
  const [inst, setInst] = useState<InstrumentDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, string | boolean>>(
    Object.fromEntries(fields.map((f) => [f.key, f.type === "boolean" ? true : ""]))
  );
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [result, setResult] = useState<"PASS" | "FAIL" | null>(null);
  const [failReason, setFailReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<"PASS" | "FAIL" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingFormRef = useRef<FormData | null>(null);

  const load = useCallback(async () => {
    try {
      const a = await api<ApplicationDTO>(`/api/v1/applications/${applicationId}`);
      setApp(a);
      setErrorMsg(null);
      // resolve serial/category/district for a human-readable job header
      api<InstrumentDTO[]>("/api/v1/instruments")
        .then((list) => setInst(list.find((i) => i.id === a.instrumentId) ?? null))
        .catch(() => undefined);
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.message : t("job.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [applicationId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const checkedIn = app?.status === "CHECKED_IN";

  async function checkIn() {
    if (!scheduleId) return;
    setCheckingIn(true);
    setErrorMsg(null);
    try {
      await api<{ status: string }>("/api/v1/schedule/checkin", {
        method: "POST",
        body: JSON.stringify({ scheduleId }),
      });
      setNotice(t("job.checkinNotice"));
      await load();
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.message : t("job.checkinFailed"));
    } finally {
      setCheckingIn(false);
    }
  }

  // GPS is best-effort: denial leaves a non-blocking banner, submit still works
  // (server decides policy). No fake fallback coordinates — real ones or none.
  const captureGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsDenied(true);
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsDenied(false);
        setGpsLoading(false);
      },
      () => {
        setGpsDenied(true);
        setGpsLoading(false);
      },
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    if (checkedIn && !gps && !gpsDenied && !gpsLoading) captureGps();
  }, [checkedIn, gps, gpsDenied, gpsLoading, captureGps]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    if (!result) {
      setErrorMsg(t("job.selectVerdict"));
      return;
    }
    if (result === "FAIL" && !failReason.trim()) {
      setErrorMsg(t("job.failReasonRequired"));
      return;
    }

    // Irreversible statutory action → require explicit confirmation with a
    // summary of what is about to be recorded before anything is sent.
    pendingFormRef.current = new FormData(e.currentTarget);
    setConfirmOpen(true);
  }

  async function performSubmit() {
    const fd = pendingFormRef.current;
    if (!fd || !result) return;
    setSubmitting(true);
    try {
      // MA3 contract: multipart with scheduleId, observations JSON, photos[]
      // (field `photos`), gpsLat/gpsLng, result, failReason when FAIL
      fd.set("scheduleId", scheduleId ?? "");
      fd.set("result", result);
      fd.set("observations", JSON.stringify(values));
      if (gps) {
        fd.set("gpsLat", String(gps.lat));
        fd.set("gpsLng", String(gps.lng));
      }
      const data = await api<{ id: string; applicationId: string; result: "PASS" | "FAIL" }>(
        "/api/v1/inspections",
        { method: "POST", body: fd }
      );
      setOutcome(data.result);
      setConfirmOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : t("job.submitFailed"));
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const locked = !checkedIn;

  if (loading) {
    return <div className="py-12 text-center text-sm text-zinc-500">{t("job.loading")}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-lg pb-28 sm:pb-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/officer"
          className="inline-flex items-center text-xs font-medium text-zinc-500 transition-colors hover:text-accent-700 dark:hover:text-accent-300 mb-2"
        >
          {t("job.back")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
          {t("job.title")}
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          {inst?.serialNumber ?? t("common.instrument")} · {inst?.district ?? "—"} ·{" "}
          <span className="font-mono">APP-{applicationId.slice(-6).toUpperCase()}</span>
          {/* promptbook_phone Prompt 3: the job header carries the same trader
              contact line as the queue — tappable only when a phone exists
              (legacy accounts show "—"). The API only emits traderPhone to
              LMO/GATC/ADMIN requesters, never to a TRADER. */}
          {app?.traderPhone && (
            <>
              {" "}· {t("officer.traderContact", "Trader contact")}:{" "}
              <a
                href={`tel:${app.traderPhone}`}
                className="font-semibold text-emerald-700 transition-colors outline-none hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-accent dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                ☎ {app.traderPhone}
              </a>
            </>
          )}
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
        >
          <div className="font-bold">{t("job.validationError")}</div>
          <div>{errorMsg}</div>
        </div>
      )}
      {notice && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300">
          ✓ {notice}
        </div>
      )}

      {/* Check-in gate: SCHEDULED → CHECKED_IN (server window −2h/+8h) */}
      {app?.status === "SCHEDULED" && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/40 dark:bg-amber-950/40">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-300">
            {scheduleId
              ? t("job.onSite")
              : t("job.openFromQueue")}
          </p>
          {scheduleId && (
            <button
              type="button"
              onClick={checkIn}
              disabled={checkingIn}
              className="mt-3 min-h-[44px] w-full rounded-full bg-amber-600 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-600/20 transition outline-none hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {checkingIn ? t("job.checkingIn") : t("job.checkIn")}
            </button>
          )}
        </div>
      )}
      {locked && app?.status !== "SCHEDULED" && (
        <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300">
          {t("job.lockedPrefix")} <span className="font-semibold">{app?.status ?? "—"}</span> {t("job.lockedSuffix")}
        </div>
      )}
      {gpsDenied && checkedIn && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-300">
          {t("job.gpsWarning")}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Verification Observations checklist */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-3">
            {t("job.checklistTitle")}
          </h2>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {fields.map((f) => (
              <div key={f.key} className="py-3 first:pt-0 last:pb-0">
                {f.type === "boolean" ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      {t(`job.obs.${f.key}`, f.label)}
                    </span>
                    {/* Explicit tri-visual state: ✓ Pass / ✕ Fail — no ambiguous
                        checkboxes; the observations payload stays boolean. */}
                    <div className="flex shrink-0 gap-1.5" role="group" aria-label={t(`job.obs.${f.key}`, f.label)}>
                      <button
                        type="button"
                        disabled={locked}
                        aria-pressed={Boolean(values[f.key])}
                        onClick={() => setValues((v) => ({ ...v, [f.key]: true }))}
                        className={`inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
                          Boolean(values[f.key])
                            ? "bg-emerald-600 text-white ring-2 ring-emerald-600 ring-offset-1 dark:ring-offset-zinc-900"
                            : "border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        <span aria-hidden="true">✓</span> {t("job.obsPass", "Pass")}
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        aria-pressed={!Boolean(values[f.key])}
                        onClick={() => setValues((v) => ({ ...v, [f.key]: false }))}
                        className={`inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
                          !Boolean(values[f.key])
                            ? "bg-rose-600 text-white ring-2 ring-rose-600 ring-offset-1 dark:ring-offset-zinc-900"
                            : "border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        <span aria-hidden="true">✕</span> {t("job.obsFail", "Fail")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {t(`job.obs.${f.key}`, f.label)}
                    </label>
                    <textarea
                      disabled={locked}
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-xs text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                      rows={2}
                      placeholder={t("job.obsPlaceholder")}
                      value={String(values[f.key])}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.value }))
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* GPS Location Capture */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2">
            {t("job.gpsTitle")}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={captureGps}
              disabled={gpsLoading || locked}
              className="min-h-[44px] rounded-full border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-xs font-semibold text-zinc-700 shadow-sm transition outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {gpsLoading ? t("job.acquiring") : t("job.captureGps")}
            </button>
            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
              {gps ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : gpsDenied ? t("job.notCaptured") : t("job.noGps")}
            </span>
          </div>
        </div>

        {/* Photo Evidence — multipart field `photos`, multiple files */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2">
            {t("job.photoTitle")}
          </h2>
          <input
            type="file"
            name="photos"
            multiple
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={locked}
            className="min-h-[44px] w-full text-sm text-zinc-700 disabled:opacity-60 dark:text-zinc-300"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            {t("job.photoHint")}
          </p>
        </div>

        {/* Mandatory Failure Reason (revealed when FAIL selected) */}
        {result === "FAIL" && (
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-5 dark:border-red-800/40 dark:bg-red-950/40">
            <label className="block text-xs font-bold uppercase tracking-wider text-red-900 dark:text-red-300">
              {t("job.failReasonTitle")}
            </label>
            <textarea
              required
              rows={3}
              name="failReason"
              disabled={locked}
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder={t("job.failReasonPlaceholder")}
              className="mt-1.5 w-full rounded-lg border border-red-300 bg-white p-2.5 text-xs text-zinc-900 shadow-sm transition outline-none focus:border-red-600 focus:ring-2 focus:ring-red-500/30 disabled:opacity-60 dark:border-red-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>
        )}

        {/* Sticky Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:static sm:z-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="mx-auto flex max-w-lg flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setResult("PASS")}
                disabled={locked}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold shadow-sm transition outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
                  result === "PASS"
                    ? "bg-emerald-600 text-white ring-2 ring-emerald-600 ring-offset-2"
                    : "border border-zinc-300 bg-zinc-50 text-zinc-700 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                {t("job.pass")}
              </button>

              <button
                type="button"
                onClick={() => setResult("FAIL")}
                disabled={locked}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold shadow-sm transition outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
                  result === "FAIL"
                    ? "bg-rose-600 text-white ring-2 ring-rose-600 ring-offset-2"
                    : "border border-zinc-300 bg-zinc-50 text-zinc-700 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                {t("job.fail")}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || submitting || locked || !result}
              className="min-h-[44px] w-full rounded-full bg-zinc-950 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
            >
              {submitting ? t("job.submitting") : t("job.submitReport")}
            </button>
          </div>
        </div>
      </form>

      {/* Explicit confirmation before the irreversible statutory submission */}
      <ConfirmationModal
        open={confirmOpen}
        title={
          result === "PASS"
            ? t("job.confirmPassTitle", "Mark this instrument as VERIFIED?")
            : t("job.confirmFailTitle", "Record a FAILED inspection?")
        }
        confirmLabel={submitting ? t("job.submitting") : t("job.confirmSubmit", "Confirm & Submit")}
        tone={result === "PASS" ? "success" : "danger"}
        busy={submitting}
        onConfirm={performSubmit}
        onCancel={() => !submitting && setConfirmOpen(false)}
      >
        {result === "PASS" ? (
          <>
            {t(
              "job.confirmPassBody",
              "You are about to mark this instrument as VERIFIED. A digitally signed certificate will be generated and this report becomes part of the permanent audit trail."
            )}
            <span className="mt-2 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {t("job.confirmIrreversible", "This action cannot be undone.")}
            </span>
          </>
        ) : (
          <>
            {t(
              "job.confirmFailBody",
              "You are about to record a FAILED inspection. The trader will be notified and the instrument will not be certified."
            )}
            {failReason.trim() && (
              <span className="mt-2 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {t("job.reasonLabel")}: {failReason}
              </span>
            )}
          </>
        )}
      </ConfirmationModal>

      {/* Outcome panels */}
      {outcome === "PASS" && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-white p-6 dark:border-emerald-800/50 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-lg dark:bg-emerald-900/40 dark:text-emerald-400">
              ✓
            </div>
            <div>
              <h2 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {t("job.passedTitle")}
              </h2>
              <p className="text-xs text-zinc-500">
                {t("job.passedDesc")}
              </p>
            </div>
          </div>
          <Link
            href="/officer"
            className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-zinc-950 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
          >
            {t("job.backQueue")}
          </Link>
        </div>
      )}
      {outcome === "FAIL" && (
        <div className="mt-6 rounded-xl border border-red-200 bg-white p-6 dark:border-red-800/50 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-700 font-bold text-lg dark:bg-red-900/40 dark:text-red-400">
              ✕
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-700 dark:text-red-400">
                {t("job.failedTitle")}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t("job.reasonLabel")}</span>{" "}
                {failReason}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {t("job.failedDesc")}
              </p>
            </div>
          </div>
          <Link
            href="/officer"
            className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-zinc-950 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
          >
            {t("job.backQueue")}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function OfficerJobPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-zinc-500">Loading job…</div>}>
      <JobPageInner />
    </Suspense>
  );
}