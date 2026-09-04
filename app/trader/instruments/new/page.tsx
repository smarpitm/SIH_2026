"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { INSTRUMENT_CATEGORIES, DISTRICTS } from "@/packages/shared/constants";
import { api, ApiError, zodFieldErrors } from "@/components/api-client";
import { PhotoInput } from "@/components/PhotoInput";
import type { InstrumentDTO } from "@/packages/shared/types";

export default function NewInstrumentPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    category: "WEIGHBRIDGE",
    make: "",
    model: "",
    serialNumber: "",
    capacity: "",
    district: "Guntur",
    address: "",
  });

  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<InstrumentDTO | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function FieldError({ name }: { name: string }) {
    const msgs = fieldErrors?.[name];
    if (!msgs?.length) return null;
    return (
      <p role="alert" className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
        {msgs.join(" · ")}
      </p>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setFieldErrors(null);

    try {
      // MA2 contract: multipart/form-data — text fields + optional purchaseProof
      // file (server magic-byte sniffs JPEG/PNG/WEBP/PDF, 10 MB cap)
      const data = await api<InstrumentDTO>("/api/v1/instruments", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      setOut(data);
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = zodFieldErrors(err.details);
        setFieldErrors(fe);
        setErrorMsg(fe ? "Please fix the highlighted fields." : err.message);
      } else {
        setErrorMsg("Network error registering instrument.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6">
        <Link
          href="/trader"
          className="inline-flex items-center text-xs font-medium text-zinc-500 transition-colors hover:text-accent-700 dark:hover:text-accent-300 mb-2"
        >
          ← Back to Trader Portal
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Register New Instrument
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Add an instrument to your commercial inventory for Legal Metrology certification.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
        >
          <div className="font-bold">Error</div>
          <div>{errorMsg}</div>
        </div>
      )}

      {!out ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Instrument Category
              </label>
              <select
                name="category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
              >
                {INSTRUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Manufacturer / Make
                </label>
                <input
                  type="text"
                  name="make"
                  value={form.make}
                  onChange={(e) => set("make", e.target.value)}
                  placeholder="e.g. Essae / Avery"
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <FieldError name="make" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Model Identifier
                </label>
                <input
                  type="text"
                  name="model"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="e.g. 40t Heavy / ER-Plus"
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <FieldError name="model" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Serial Number (Chassis/Plate)
                </label>
                <input
                  type="text"
                  name="serialNumber"
                  value={form.serialNumber}
                  onChange={(e) => set("serialNumber", e.target.value)}
                  placeholder="e.g. WB-9021"
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 font-mono text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <FieldError name="serialNumber" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Rated Capacity / Range
                </label>
                <input
                  type="text"
                  name="capacity"
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  placeholder="e.g. 40t / 150kg"
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <FieldError name="capacity" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Operating District
              </label>
              <select
                name="district"
                value={form.district}
                onChange={(e) => set("district", e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Physical Installation Address
              </label>
              <textarea
                rows={2}
                name="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Plot/Shop address where instrument is located for inspection"
                required
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
              />
              <FieldError name="address" />
            </div>

            {/* MA2: optional purchase proof — sent as multipart field `purchaseProof` */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
              <PhotoInput
                name="purchaseProof"
                label="Purchase Proof (optional — JPEG / PNG / WEBP / PDF, max 10 MB)"
                accept="image/jpeg,image/png,image/webp,application/pdf"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center rounded-full bg-zinc-950 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
            >
              {loading ? "Saving Instrument…" : "Save Instrument Record"}
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm dark:border-emerald-800/40 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-lg dark:bg-emerald-900/40 dark:text-emerald-400">
              ✓
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Instrument Registered!
              </h2>
              <p className="text-xs text-zinc-500">
                The instrument has been registered and is ready for verification application.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 font-mono text-[11px] text-emerald-400 dark:border-zinc-800">
              {JSON.stringify(out, null, 2)}
            </pre>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/trader")}
              className="flex-1 rounded-full bg-zinc-950 py-2 text-xs font-semibold text-white transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent dark:bg-white dark:text-zinc-950"
            >
              Back to Instruments List
            </button>
          </div>
        </div>
      )}
    </div>
  );
}