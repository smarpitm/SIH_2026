"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OBSERVATION_CONFIG } from "@/packages/shared/constants";
import { PhotoInput } from "@/components/PhotoInput";
import { api, ApiError } from "@/components/api-client";

export default function OfficerJobPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const fields = OBSERVATION_CONFIG.default;

  const [values, setValues] = useState<Record<string, string | boolean>>(
    Object.fromEntries(fields.map((f) => [f.key, f.type === "boolean" ? true : ""]))
  );
  const [gps, setGps] = useState<string>("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [result, setResult] = useState<"PASS" | "FAIL" | null>(null);
  const [failReason, setFailReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function captureGps() {
    if (!navigator.geolocation) {
      setGps("16.306700, 80.436500 (demo fix)");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        setGpsLoading(false);
      },
      () => {
        setGps("16.306700, 80.436500 (Guntur demo GPS)");
        setGpsLoading(false);
      },
      { timeout: 5000 }
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!result) {
      setErrorMsg("Please select an inspection verdict (PASS or FAIL) before submitting.");
      return;
    }

    if (result === "FAIL" && !failReason.trim()) {
      setErrorMsg("Mandatory failure reason is required when marking an inspection as FAILED.");
      return;
    }

    setLoading(true);

    try {
      const data = await api<Record<string, unknown>>("/api/v1/inspections", {
        method: "POST",
        body: JSON.stringify({
          applicationId: applicationId as string,
          result,
          failReason: result === "FAIL" ? failReason : undefined,
          gps: gps || "16.306700, 80.436500",
          values,
        }),
      });
      setOut(JSON.stringify(data, null, 2));
    } catch (e) {
      setErrorMsg(
        e instanceof ApiError ? e.message : "Failed to submit inspection report. Please check connection."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg pb-28 sm:pb-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/officer"
          className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-2"
        >
          ← Back to Inspection Queue
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          On-Site Field Inspection
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Job Application ID: <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{applicationId}</span>
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
        >
          <div className="font-bold">Validation Error</div>
          <div>{errorMsg}</div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Verification Observations checklist */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-3">
            Statutory Checklist &amp; Criteria
          </h2>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {fields.map((f) => (
              <div key={f.key} className="py-3 first:pt-0 last:pb-0">
                {f.type === "boolean" ? (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      checked={Boolean(values[f.key])}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.checked }))
                      }
                    />
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      {f.label}
                    </span>
                  </label>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {f.label}
                    </label>
                    <textarea
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-xs text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      rows={2}
                      placeholder="Enter specific calibration observations or remarks…"
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
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2">
            Geo-Location Tagging
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={captureGps}
              disabled={gpsLoading}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {gpsLoading ? "Acquiring Fix…" : "📍 Capture GPS"}
            </button>
            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
              {gps || "No GPS coordinate tagged"}
            </span>
          </div>
        </div>

        {/* Photo Evidence */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2">
            Verification Photo Proof
          </h2>
          <PhotoInput name="inspector-photo" />
        </div>

        {/* Mandatory Failure Reason (revealed when FAIL selected) */}
        {result === "FAIL" && (
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-5 dark:border-red-800/40 dark:bg-red-950/40">
            <label className="block text-xs font-bold uppercase tracking-wider text-red-900 dark:text-red-300">
              Mandatory Rejection / Failure Reason *
            </label>
            <textarea
              required
              rows={3}
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder="State the exact non-compliance clause, broken seal, or error exceeding MPE tolerance…"
              className="mt-1.5 w-full rounded-lg border border-red-300 bg-white p-2.5 text-xs text-zinc-900 shadow-sm focus:border-red-600 focus:outline-none dark:border-red-700 dark:bg-zinc-800 dark:text-white"
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
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold shadow-sm transition ${
                  result === "PASS"
                    ? "bg-emerald-600 text-white ring-2 ring-emerald-600 ring-offset-2"
                    : "border border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                ✓ PASS
              </button>

              <button
                type="button"
                onClick={() => setResult("FAIL")}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold shadow-sm transition ${
                  result === "FAIL"
                    ? "bg-rose-600 text-white ring-2 ring-rose-600 ring-offset-2"
                    : "border border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                ✕ FAIL
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !result}
              className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              {loading ? "Submitting Inspection…" : "Submit Official Inspection Report"}
            </button>
          </div>
        </div>
      </form>

      {/* Output Response */}
      {out && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Inspection Recorded (Server Response):
          </div>
          <pre className="max-h-60 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 font-mono text-[11px] text-emerald-400 dark:border-zinc-800">
            {out}
          </pre>
        </div>
      )}
    </div>
  );
}