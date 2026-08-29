"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/components/api-client";
import type { ApplicationDTO } from "@/packages/shared/types";

type Step = 1 | 2 | 3;

export default function ApplyPage() {
  const { instrumentId } = useParams<{ instrumentId: string }>();

  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<"NEW" | "RE_VERIFICATION">("NEW");
  const [reVerificationReason, setReVerificationReason] = useState("Periodic 1-year statutory verification");
  const [declared, setDeclared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function createAndPay() {
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1) Create application (real route returns a single ApplicationDTO)
      const created = await api<ApplicationDTO>("/api/v1/applications", {
        method: "POST",
        body: JSON.stringify({
          instrumentId: instrumentId as string,
          type,
          reVerificationReason: type === "RE_VERIFICATION" ? reVerificationReason : undefined,
        }),
      });
      const applicationId = created.id;

      // 2) Pay fee
      const paid = await api<Record<string, unknown>>(`/api/v1/applications/${applicationId}/pay`, {
        method: "POST",
        body: "{}",
      });

      // 3) Submit application
      const submitted = await api<Record<string, unknown>>(`/api/v1/applications/${applicationId}/submit`, {
        method: "POST",
        body: "{}",
      });

      setSubmittedData({
        applicationId,
        created,
        payment: paid,
        submission: submitted,
        submittedAt: new Date().toISOString(),
      });
    } catch (e) {
      setErrorMsg(
        e instanceof ApiError ? e.message : "Failed to complete application submission. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    { num: 1, label: "Verification Type" },
    { num: 2, label: "Declaration" },
    { num: 3, label: "Fee & Submit" },
  ];

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/trader"
          className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-2"
        >
          ← Back to Trader Portal
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Application for Instrument Verification
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Target Instrument ID: <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{instrumentId}</span>
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
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
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
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  Step 1: Select Verification Type
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Choose whether this is a brand new verification or statutory re-verification.
                </p>
              </div>

              <div className="space-y-3">
                <label
                  onClick={() => setType("NEW")}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                    type === "NEW"
                      ? "border-zinc-900 bg-zinc-50/70 ring-1 ring-zinc-900 dark:border-white dark:bg-zinc-800 dark:ring-white"
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
                      Initial Verification (New Instrument)
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      For newly installed or purchased instruments not verified previously.
                    </div>
                  </div>
                </label>

                <label
                  onClick={() => setType("RE_VERIFICATION")}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                    type === "RE_VERIFICATION"
                      ? "border-zinc-900 bg-zinc-50/70 ring-1 ring-zinc-900 dark:border-white dark:bg-zinc-800 dark:ring-white"
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
                      Statutory Re-Verification (Renewal)
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      For existing instruments approaching statutory expiry (annual/biennial cycle).
                    </div>
                  </div>
                </label>
              </div>

              {type === "RE_VERIFICATION" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Reason / Renewal Type
                  </label>
                  <input
                    type="text"
                    value={reVerificationReason}
                    onChange={(e) => setReVerificationReason(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  Next: Declaration →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  Step 2: Statutory Declaration &amp; Consent
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Legal compliance under the Legal Metrology (General) Rules 2011.
                </p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-300">
                <div className="font-bold mb-1">Standard Statutory Declaration:</div>
                I hereby declare that the instrument particulars, serial numbers, and location provided are true, complete, and un-tampered. I consent to scheduled physical inspection, testing, stamping, and digital certificate issuance by an authorized Legal Metrology Officer (LMO) or Govt-Approved Test Centre (GATC).
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 cursor-pointer hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                <input
                  type="checkbox"
                  checked={declared}
                  onChange={(e) => setDeclared(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  I accept the statutory terms and confirm the instrument is ready for inspection.
                </span>
              </label>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={!declared}
                  onClick={() => setStep(3)}
                  className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  Continue to Payment →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  Step 3: Verification Fee &amp; Mock Payment
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Statutory fee payment is required before officer allocation.
                </p>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 divide-y divide-zinc-200 dark:border-zinc-800 dark:bg-zinc-800/50 dark:divide-zinc-700">
                <div className="flex justify-between py-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">Target Instrument</span>
                  <span className="font-mono font-semibold text-zinc-900 dark:text-white">{instrumentId}</span>
                </div>
                <div className="flex justify-between py-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">Application Type</span>
                  <span className="font-semibold text-zinc-900 dark:text-white">{type}</span>
                </div>
                <div className="flex justify-between py-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">Statutory Fee (Demo)</span>
                  <span className="font-bold text-sm text-zinc-900 dark:text-white">₹ 100.00</span>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-800 dark:border-blue-800/40 dark:bg-blue-950/40 dark:text-blue-300">
                ℹ Mock Payment Gateway is active. Clicking &quot;Pay &amp; Submit Application&quot; will process test transaction and submit application.
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={createAndPay}
                  className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {loading ? "Processing Payment & Submitting…" : "Pay ₹100 & Submit Application"}
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
                Application Successfully Submitted!
              </h2>
              <p className="text-xs text-zinc-500">
                Your application has been logged and queued for inspection scheduling.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Returned Application Response (JSON):
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-4 font-mono text-[11px] leading-tight text-emerald-400 dark:border-zinc-800">
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href="/trader"
              className="flex-1 text-center rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
            >
              Return to Trader Portal
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}