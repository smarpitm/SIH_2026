"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/components/api-client";
import { useTranslation } from "@/lib/i18n";
import type { InstrumentDTO } from "@/packages/shared/types";

// K15: instrument record page — the M7 search contract links items here
// (/trader/instruments/[id]), so the path must exist. Prints clean A4.
export default function InstrumentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [instrument, setInstrument] = useState<InstrumentDTO | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<InstrumentDTO>(`/api/v1/instruments/${id}`)
      .then(setInstrument)
      .catch((e) => {
        // 404 (bad id) and 403 (another trader's instrument) both land here —
        // the message below covers either without leaking scope details.
        void e;
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-zinc-500">{t("inst.loading")}</div>;
  }

  if (notFound || !instrument) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
        {t("inst.notFound")}
      </div>
    );
  }

  const fields: [string, string][] = [
    [t("inst.category"), instrument.category],
    [t("inst.makeModel"), `${instrument.make} ${instrument.model}`],
    [t("inst.capacity"), instrument.capacity],
    [t("inst.district"), instrument.district],
    [t("inst.address"), instrument.address],
    [t("inst.registered"), new Date(instrument.createdAt).toLocaleDateString()],
  ];

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div className="no-print flex items-center justify-between">
        <Link
          href="/trader"
          className="text-xs font-semibold text-zinc-500 underline transition-colors hover:text-accent-700 dark:hover:text-accent-300"
        >
          {t("inst.back")}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {t("inst.print")}
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            {t("inst.record")}
          </span>
          <div className="font-mono text-lg font-bold text-zinc-900 dark:text-white">
            {instrument.serialNumber}
          </div>
        </div>

        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {fields.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="text-right font-medium text-zinc-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="no-print mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Link
            href={`/trader/apply/${instrument.id}`}
            className="inline-flex w-full items-center justify-center rounded-full bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
          >
            {t("inst.applyFor")}
          </Link>
        </div>
      </div>
    </div>
  );
}