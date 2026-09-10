"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusChip } from "@/components/StatusChip";
import { api, ApiError } from "@/components/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatBusinessDate } from "@/lib/time";
import type { ApplicationDTO, InstrumentDTO } from "@/packages/shared/types";

// success path in frozen transition order (packages/shared/constants TRANSITIONS);
// FAILED / REJECTED are side states rendered as an extra red chip when current
const TIMELINE = ["DRAFT", "SUBMITTED", "SCHEDULED", "CHECKED_IN", "PASSED", "CERT_ISSUED"] as const;

export default function ApplicationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<ApplicationDTO | null>(null);
  const [serial, setSerial] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [certBusy, setCertBusy] = useState(false);

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
      setErrorMsg(e instanceof ApiError ? e.message : t("appd.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

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
        `${t("appd.rescheduledPrefix")}${res.rescheduleCount} ${t("appd.rescheduledOn")} ${new Date(res.scheduledFor).toLocaleDateString()}.`
      );
      setShowReschedule(false);
      setReason("");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESCHEDULE_BUDGET_EXHAUSTED") {
        setErrorMsg(t("appd.limitReached"));
      } else {
        setErrorMsg(e instanceof ApiError ? e.message : t("common.error"));
      }
    } finally {
      setBusy(false);
    }
  }

  // Print/download the QR certificate PDF. The PDF endpoint does its own
  // authz (owner / issuer / district-LMO / admin) and answers with a
  // short-lived presigned URL (B2, S3-compatible) — we just open it, so no
  // token handling in the client and no new env/config on Vercel.
  async function downloadCertificate() {
    const certId = app?.certificate?.certId;
    if (!certId || certBusy) return;
    setCertBusy(true);
    setErrorMsg(null);
    try {
      const { url } = await api<{ url: string }>(`/api/v1/certificates/${certId}/pdf`);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener,noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.message : t("appd.cert.downloadFailed"));
    } finally {
      setCertBusy(false);
    }
  }

  const currentIndex = app ? TIMELINE.indexOf(app.status as (typeof TIMELINE)[number]) : -1;
  const isSideState = app ? app.status === "FAILED" || app.status === "REJECTED" : false;

  // "What happens now" (P0#3) — every state tells the trader the current
  // status, the next step, who is responsible, and what action is expected.
  type NowPanel = {
    tone: "amber" | "blue" | "emerald" | "rose";
    next: string;
    party: string;
    action: string;
  };
  const NOW_PANELS: Record<string, NowPanel> = {
    DRAFT: {
      tone: "amber",
      next: t("appd.now.draft.step", "Submit your application"),
      party: t("appd.now.draft.party", "You (Trader)"),
      action: t("appd.now.draft.action", "Complete the form and pay the statutory fee to enter the queue."),
    },
    SUBMITTED: {
      tone: "blue",
      next: t("appd.now.submitted.step", "Document review"),
      party: t("appd.now.submitted.party", "District LMO / GATC officer"),
      action: t("appd.now.submitted.action", "The officer verifies your application details and schedules the inspection."),
    },
    SCHEDULED: {
      tone: "blue",
      next: t("appd.now.scheduled.step", "Physical inspection"),
      party: t("appd.now.scheduled.party", "Assigned LMO / GATC officer"),
      action: t("appd.now.scheduled.action", "Keep the instrument ready and be present at the scheduled slot."),
    },
    CHECKED_IN: {
      tone: "blue",
      next: t("appd.now.checkedIn.step", "Inspection in progress"),
      party: t("appd.now.checkedIn.party", "Assigned LMO / GATC officer"),
      action: t("appd.now.checkedIn.action", "The officer records observations, photos and GPS evidence on site."),
    },
    PASSED: {
      tone: "emerald",
      next: t("appd.now.passed.step", "Certificate issuance"),
      party: t("appd.now.passed.party", "PRAMANAM system"),
      action: t("appd.now.passed.action", "A digitally signed certificate is generated for this instrument."),
    },
    CERT_ISSUED: {
      tone: "emerald",
      next: t("appd.now.certIssued.step", "Validity tracking"),
      party: t("appd.now.certIssued.party", "You (Trader)"),
      action: t("appd.now.certIssued.action", "View or print the certificate and re-verify before statutory expiry."),
    },
    FAILED: {
      tone: "rose",
      next: t("appd.now.failed.step", "Repair and re-verify"),
      party: t("appd.now.failed.party", "You (Trader)"),
      action: t("appd.now.failed.action", "Fix the reported non-compliance and submit a fresh application."),
    },
    REJECTED: {
      tone: "rose",
      next: t("appd.now.rejected.step", "Reapply"),
      party: t("appd.now.rejected.party", "You (Trader)"),
      action: t("appd.now.rejected.action", "Review the rejection reason and submit a corrected application."),
    },
  };
  const nowPanel: NowPanel | null = app ? (NOW_PANELS[app.status] ?? null) : null;
  const nowToneCls = {
    amber: "border-amber-300 bg-amber-50/70 dark:border-amber-800/50 dark:bg-amber-950/30",
    blue: "border-blue-200 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/30",
    emerald: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/30",
    rose: "border-rose-200 bg-rose-50/60 dark:border-rose-800/40 dark:bg-rose-950/30",
  }[nowPanel?.tone ?? "blue"];

  if (loading) {
    return <div className="py-12 text-center text-sm text-zinc-500">{t("appd.loading")}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6">
        <Link
          href="/trader"
          className="mb-2 inline-flex items-center text-xs font-medium text-zinc-500 transition-colors hover:text-accent-700 dark:hover:text-accent-300"
        >
          {t("appd.back")}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {serial ?? t("appd.word")} · APP-{(app?.id ?? id).slice(-6).toUpperCase()}
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
          {/* What happens now — current status, next step, responsible party, expected action */}
          {nowPanel && (
            <section
              aria-label={t("appd.nowTitle", "What happens now")}
              className={`mb-4 rounded-xl border p-5 ${nowToneCls}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-zinc-950 dark:text-white">
                  {t("appd.nowTitle", "What happens now")}
                </h2>
                <StatusChip status={app.status} />
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {t("appd.nowNext", "Next step")}
                  </dt>
                  <dd className="mt-0.5 font-semibold text-zinc-900 dark:text-white">{nowPanel.next}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {t("appd.nowParty", "Responsible party")}
                  </dt>
                  <dd className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">{nowPanel.party}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {t("appd.nowAction", "Expected action")}
                  </dt>
                  <dd className="mt-0.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{nowPanel.action}</dd>
                </div>
              </dl>
            </section>
          )}

          {/* Status Timeline */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t("appd.statusTimeline")}
            </h2>
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
              {TIMELINE.map((s, i) => {
                const current = s === app.status;
                const done = !isSideState && i < currentIndex;
                // review: explicit stage markers — ✓ done · ● current · ○ ahead
                const marker = done ? "✓" : current ? "●" : "○";
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
                      <span aria-hidden="true" className="mr-1">{marker}</span>
                      {t(`status.${s}`, s)}
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
              {t("appd.details")}
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">{t("common.instrument")}</dt>
                <dd className="font-mono text-zinc-900 dark:text-white">{serial ?? app.instrumentId}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">{t("appd.type")}</dt>
                <dd className="text-zinc-900 dark:text-white">{app.type}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">{t("appd.preferredDate")}</dt>
                <dd className="text-zinc-900 dark:text-white">
                  {app.preferredDate ? formatBusinessDate(new Date(app.preferredDate)) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">{t("appd.feePaid")}</dt>
                <dd className="text-zinc-900 dark:text-white">
                  {app.feePaidAt ? new Date(app.feePaidAt).toLocaleString() : t("common.notYet")}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-zinc-500">{t("appd.created")}</dt>
                <dd className="text-zinc-900 dark:text-white">{new Date(app.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          {/* Certificate — always visible; greyed out until issued. Enabled
              state is driven by the certificate row itself (covers ACTIVE,
              EXPIRED and REVOKED — a revoked cert still prints, watermarked). */}
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {t("appd.cert.title")}
                </h2>
                {app.certificate ? (
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {t("appd.cert.id")}: <span className="font-mono">{app.certificate.certId}</span>
                  </p>
                ) : app.status === "CERT_ISSUED" ? (
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                    {t("appd.cert.generating", "Certificate issued — syncing document (refresh in a moment)")}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-zinc-500">{t("appd.cert.notIssued")}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {app.certificate && (
                  <a
                    href={`/verify/${app.certificate.certId}`}
                    target="_blank"
                    rel="noopener,noreferrer"
                    className="shrink-0 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {t("appd.certVerify", "Public Verify")}
                  </a>
                )}
                <button
                  type="button"
                  onClick={downloadCertificate}
                  disabled={!app.certificate || certBusy}
                  title={app.certificate ? undefined : t("appd.cert.notIssued")}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition outline-none ${
                    app.certificate
                      ? "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-accent"
                      : "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                  }`}
                >
                  {certBusy ? t("appd.cert.preparing") : t("appd.cert.download")}
                </button>
              </div>
            </div>
          </div>

          {/* Reschedule (MA3 item 5) */}
          {app.status === "SCHEDULED" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-5 shadow-sm dark:border-amber-800/40 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {t("appd.rescheduleTitle")}
                  </h2>
                  {/* ponytail: ApplicationDTO carries no rescheduleCount, so the button
                      shows for any SCHEDULED app and the server's budget (max 2) is the
                      authority — RESCHEDULE_BUDGET_EXHAUSTED surfaces as the limit message */}
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {t("appd.rescheduleDesc")}
                  </p>
                </div>
                {!showReschedule && (
                  <button
                    type="button"
                    onClick={() => setShowReschedule(true)}
                    className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 transition outline-none hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-accent dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  >
                    {t("appd.requestReschedule")}
                  </button>
                )}
              </div>

              {showReschedule && (
                <div className="mt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    {t("common.reason")} <span className="normal-case font-normal">{t("appd.minChars")}</span>
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
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={busy || reason.trim().length < 10}
                      onClick={reschedule}
                      className="rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
                    >
                      {busy ? t("appd.requesting") : t("appd.confirm")}
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