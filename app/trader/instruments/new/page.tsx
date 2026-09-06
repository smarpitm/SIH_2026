"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { INSTRUMENT_CATEGORIES, DISTRICTS } from "@/packages/shared/constants";
import { api, ApiError, zodFieldErrors } from "@/components/api-client";
import { PhotoInput } from "@/components/PhotoInput";
import { useTranslation } from "@/lib/i18n";
import { readStoredUser } from "@/lib/store";
import type { InstrumentDTO } from "@/packages/shared/types";

export default function NewInstrumentPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [form, setForm] = useState({
    category: "WEIGHBRIDGE",
    make: "",
    model: "",
    serialNumber: "",
    capacity: "",
    // AUDIT FINDING #101: default to DISTRICTS[0]; the effect below narrows it
    // to the trader's registered district (POST /instruments enforces it).
    district: DISTRICTS[0] as string,
    address: "",
  });

  // AUDIT FINDING #101: default the district dropdown to the trader's own
  // registered district — POST /instruments rejects instruments outside the
  // trader's home district, so a hardcoded "Guntur" default was a trap for
  // every non-Guntur trader.
  useEffect(() => {
    const own = readStoredUser()?.district;
    if (own) setForm((f) => ({ ...f, district: own }));
  }, []);

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
        setErrorMsg(fe ? t("newInst.fixFields") : err.message);
      } else {
        setErrorMsg(t("newInst.networkError"));
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
          {t("newInst.back")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          {t("newInst.title")}
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          {t("newInst.subtitle")}
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
        >
          <div className="font-bold">{t("newInst.errorHead")}</div>
          <div>{errorMsg}</div>
        </div>
      )}

      {!out ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="border-b border-zinc-100 pb-2 dark:border-zinc-800">
              <h2 className="section-title">{t("newInst.secInfo", "Instrument Information")}</h2>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t("newInst.category")}
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
                  {t("newInst.make")}
                </label>
                <input
                  type="text"
                  name="make"
                  value={form.make}
                  onChange={(e) => set("make", e.target.value)}
                  placeholder={t("newInst.phMake")}
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <FieldError name="make" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t("newInst.model")}
                </label>
                <input
                  type="text"
                  name="model"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder={t("newInst.phModel")}
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <FieldError name="model" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t("newInst.serial")}
                </label>
                <input
                  type="text"
                  name="serialNumber"
                  value={form.serialNumber}
                  onChange={(e) => set("serialNumber", e.target.value)}
                  placeholder={t("newInst.phSerial")}
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 font-mono text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <FieldError name="serialNumber" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t("newInst.capacity")}
                </label>
                <input
                  type="text"
                  name="capacity"
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  placeholder={t("newInst.phCapacity")}
                  required
                  className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
                />
                <FieldError name="capacity" />
              </div>
            </div>

            <div className="border-b border-zinc-100 pb-2 dark:border-zinc-800">
              <h2 className="section-title">{t("newInst.secLocation", "Location")}</h2>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t("newInst.district")}
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
                {t("newInst.address")}
              </label>
              <textarea
                rows={2}
                name="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder={t("newInst.phAddress")}
                required
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
              />
              <FieldError name="address" />
            </div>

            {/* MA2: optional purchase proof — sent as multipart field `purchaseProof` */}
            <div className="border-b border-zinc-100 pb-2 dark:border-zinc-800">
              <h2 className="section-title">{t("newInst.secDocs", "Documents")}</h2>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
              <PhotoInput
                name="purchaseProof"
                label={t("newInst.purchaseProof")}
                accept="image/jpeg,image/png,image/webp,application/pdf"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary mt-2 w-full">
              {loading ? t("newInst.saving") : t("newInst.save")}
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
                {t("newInst.successTitle")}
              </h2>
              <p className="text-xs text-zinc-500">
                {t("newInst.successDesc")}
              </p>
            </div>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer select-none text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-300">
              ▸ {t("newInst.recordJson", "View registration record")}
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 font-mono text-[11px] text-emerald-400 dark:border-zinc-800">
              {JSON.stringify(out, null, 2)}
            </pre>
          </details>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/trader")}
              className="flex-1 rounded-full bg-zinc-950 py-2 text-xs font-semibold text-white transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent dark:bg-white dark:text-zinc-950"
            >
              {t("newInst.backList")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}