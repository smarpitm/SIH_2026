"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { INSTRUMENT_CATEGORIES, DISTRICTS } from "@/packages/shared/constants";

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
  const [out, setOut] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const r = await fetch("/api/v1/instruments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();

      if (data && data.ok) {
        setOut(data.data);
      } else {
        setErrorMsg(data?.error?.message ?? "Failed to register instrument.");
      }
    } catch {
      setErrorMsg("Network error registering instrument.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6">
        <Link
          href="/trader"
          className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-2"
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
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Instrument Category
              </label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
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
                  value={form.make}
                  onChange={(e) => set("make", e.target.value)}
                  placeholder="e.g. Essae / Avery"
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Model Identifier
                </label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="e.g. 40t Heavy / ER-Plus"
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Serial Number (Chassis/Plate)
                </label>
                <input
                  type="text"
                  value={form.serialNumber}
                  onChange={(e) => set("serialNumber", e.target.value)}
                  placeholder="e.g. WB-9021"
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 font-mono text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Rated Capacity / Range
                </label>
                <input
                  type="text"
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  placeholder="e.g. 40t / 150kg"
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Operating District
              </label>
              <select
                value={form.district}
                onChange={(e) => set("district", e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
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
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Plot/Shop address where instrument is located for inspection"
                required
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
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
              className="flex-1 rounded-lg bg-zinc-900 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
            >
              Back to Instruments List
            </button>
          </div>
        </div>
      )}
    </div>
  );
}