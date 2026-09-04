"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { api, ApiError } from "@/components/api-client";
import { useTranslation } from "@/lib/i18n";
import type { ApplicationDTO } from "@/packages/shared/types";

type Step = 1 | 2 | 3;

interface SubmittedPayload {
  applicationId: string;
  created: ApplicationDTO;
  payment: Record<string, unknown>;
  submitted: { status: string };
}

export default function ApplyPage() {
  const { t } = useTranslation();
  const { instrumentId } = useParams<{ instrumentId: string }>();

  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<"NEW" | "RE_VERIFICATION">("NEW");
  const [reVerificationReason, setReVerificationReason] = useState("Periodic 1-year statutory verification");
  const [preferredDate, setPreferredDate] = useState("");
  const [declared, setDeclared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedData, setSubmittedData] = useState<SubmittedPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function createAndPay() {
    setLoading(true);
    setErrorMsg(null);

    // guard: server accepts any datetime for preferredDate, so the UI is the
    // only place a past date gets caught — string compare on ISO date parts
    const todayStr = new Date().toISOString().slice(0, 10);
    if (preferredDate && preferredDate < todayStr) {
      setErrorMsg(t("apply.pastDateError"));
      setLoading(false);
      return;
    }

    try {
      // 1) Create application (MA2). declarationAccepted rides along here per the
      // flow contract; the server enforces it at submit time.
      const created = await api<ApplicationDTO>("/api/v1/applications", {
        method: "POST",
        body: JSON.stringify({
          instrumentId: instrumentId as string,
          type,
          ...(preferredDate
            ? { preferredDate: new Date(`${preferredDate}T00:00:00.000Z`).toISOString() }
            : {}),
          ...(type === "RE_VERIFICATION" ? { reVerificationReason } : {}),
          declarationAccepted: true,
        }),
      });
      const applicationId = created.id;

      // 2) Pay fee — api() throws on ok:false, so the chain stops on any failure
      const paid = await api<Record<string, unknown>>(`/api/v1/applications/${applicationId}/pay`, {
        method: "POST",
        body: "{}",
      });

      // 3) Submit (MA3): DRAFT→SUBMITTED→SCHEDULED with auto-allocation
      const submitted = await api<{ status: string }>(`/api/v1/applications/${applicationId}/submit`, {
        method: "POST",
        body: JSON.stringify({ declarationAccepted: true }),
      });

      setSubmittedData({
        applicationId,
        created,
        payment: paid,
        submitted,
      });
    } catch (e) {
      setErrorMsg(
        e instanceof ApiError ? e.message : t("apply.submitError")
      );
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    { num: 1, label: t("apply.step1") },
    { num: 2, label: t("apply.step2") },
    { num: 3, label: t("apply.step3") },
  ];

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/trader"
          className="inline-flex items-center text-xs font-medium text-zinc-500 transition-colors hover:text-accent-700 dark:hover:text-accent-300 mb-2"
        >
          {t("apply.backToTrader")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
          {t("apply.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t("apply.targetInstrument")} <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{instrumentId}</span>
        </p>
      </div>

      {/* Step Indicator 1-2-3 */}
      <div className="mb-8 flex items-center justify-between">
        {steps.map((s, idx) => {
          const isCurrent = step === s.num;
          const isDone = step > s.num || Boolean(submittedData);
          return (
            <div key={s.num} className="flex items-center flex-1">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                    isDone
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "border border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
                  }`}
                >
                  {isDone ? "✓" : s.num}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${
                    isCurrent ? "font-bold text-zinc-900 dark:text-white" : "text-zinc-500"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`mx-3 h-0.5 flex-1 ${
                    step > s.num ? "bg-emerald-600" : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {errorMsg && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Step Cards */}
      {!submittedData ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  {t("apply.step1Title")}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t("apply.step1Desc")}
                </p>
              </div>

              <div className="space-y-3">
                <label
                  onClick={() => setType("NEW")}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                    type === "NEW"
                      ? "border-accent-600 bg-accent-50/70 ring-1 ring-accent dark:border-accent-400 dark:bg-accent-400/10 dark:ring-accent"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="appType"
                    checked={type === "NEW"}
                    onChange={() => setType("NEW")}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-sm text-zinc-900 dark:text-white">
                      {t("apply.initialV")}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {t("apply.initialDesc")}
                    </div>
                  </div>
                </label>

                <label
                  onClick={() => setType("RE_VERIFICATION")}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                    type === "RE_VERIFICATION"
                      ? "border-accent-600 bg-accent-50/70 ring-1 ring-accent dark:border-accent-400 dark:bg-accent-400/10 dark:ring-accent"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="appType"
                    checked={type === "RE_VERIFICATION"}
                    onChange={() => setType("RE_VERIFICATION")}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-sm text-zinc-900 dark:text-white">
                      {t("apply.reV")}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {t("apply.reDesc")}
                    </div>
                  </div>
                </label>
              </div>

              {type === "RE_VERIFICATION" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    {t("apply.reason")}
                  </label>
                  <input
                    type="text"
                    value={reVerificationReason}
                    onChange={(e) => setReVerificationReason(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t("apply.preferredDate")} <span className="normal-case font-normal">{t("apply.optional")}</span>
                </label>
                <input
                  type="date"
                  value={preferredDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  {t("apply.dateHint")}
                </p>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
                >
                  {t("apply.nextDeclaration")}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  {t("apply.step2Title")}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t("apply.step2Desc")}
                </p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-300">
                <div className="font-bold mb-1">{t("apply.declarationHead")}</div>
                {t("apply.declarationBody")}
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 cursor-pointer hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                <input
                  type="checkbox"
                  checked={declared}
                  onChange={(e) => setDeclared(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-accent-600 focus:ring-accent"
                />
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {t("apply.acceptDecl")}
                </span>
              </label>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 transition outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={!declared}
                  onClick={() => setStep(3)}
                  className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
                >
                  {t("apply.toPayment")}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  {t("apply.step3Title")}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t("apply.step3Desc")}
                </p>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 divide-y divide-zinc-200 dark:border-zinc-800 dark:bg-zinc-800/50 dark:divide-zinc-700">
                <div className="flex justify-between py-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">{t("apply.targetLabel")}</span>
                  <span className="font-mono font-semibold text-zinc-900 dark:text-white">{instrumentId}</span>
                </div>
                <div className="flex justify-between py-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">{t("apply.applicationType")}</span>
                  <span className="font-semibold text-zinc-900 dark:text-white">{t(type === "NEW" ? "apply.typeNew" : "apply.typeRe", type)}</span>
                </div>
                <div className="flex justify-between py-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">{t("apply.statutoryFee")}</span>
                  <span className="font-bold text-sm text-zinc-900 dark:text-white">₹ 100.00</span>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-800 dark:border-blue-800/40 dark:bg-blue-950/40 dark:text-blue-300">
                {t("apply.mockInfo")}
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 transition outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={createAndPay}
                  className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition outline-none hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  {loading ? t("apply.paying") : t("apply.paySubmit")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* SUCCESS PANEL */
        <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm dark:border-emerald-800/50 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-lg dark:bg-emerald-900/40 dark:text-emerald-400">
              ✓
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                {t("apply.successTitle")}
              </h2>
              <p className="text-xs text-zinc-500">
                {t("apply.successDesc")}
              </p>
            </div>
          </div>

          {/* Final status chip — submit returns the real post-allocation status */}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("apply.statusWord")}</span>
            <StatusChip status={submittedData.submitted?.status ?? "SUBMITTED"} />
          </div>

          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              {t("apply.returnedJson")}
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-4 font-mono text-[11px] leading-tight text-emerald-400 dark:border-zinc-800">
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/trader/applications/${submittedData.applicationId}`}
              className="flex-1 text-center rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white transition outline-none hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {t("apply.viewTimeline")}
            </Link>
            <Link
              href="/trader"
              className="flex-1 text-center rounded-full bg-zinc-950 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
            >
              {t("apply.returnPortal")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}