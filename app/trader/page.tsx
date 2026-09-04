"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { CountdownRing } from "@/components/CountdownRing";
import { api } from "@/components/api-client";
import { ExportButtons } from "@/components/export-buttons";
import { useTranslation } from "@/lib/i18n";
import type { DashCounts, InstrumentDTO, ApplicationDTO } from "@/packages/shared/types";

// ponytail: no endpoint lists a trader's certificates yet (cert lookup route is
// still a mock stub), so validity rings light up only when an instrument payload
// carries a certificate — upgrade path: MA-suite adds cert info to a payload.
type InstrumentWithCert = InstrumentDTO & {
  certificate?: { certId: string; status: string; validFrom: string; validUntil: string };
};

export default function TraderPage() {
  const { t } = useTranslation();
  const [dash, setDash] = useState<DashCounts | null>(null);
  const [instruments, setInstruments] = useState<InstrumentWithCert[]>([]);
  const [applications, setApplications] = useState<ApplicationDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<DashCounts>("/api/v1/dashboards/trader"),
      api<InstrumentWithCert[]>("/api/v1/instruments"),
      api<ApplicationDTO[]>("/api/v1/applications"),
    ])
      .then(([d, i, a]) => {
        setDash(d);
        setInstruments(i);
        setApplications(a);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  // Validity from the latest certificate when the payload includes one
  const certOf = (ins: InstrumentWithCert) => ins.certificate;

  return (
    <div className="flex flex-col gap-8">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
            {t("trader.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("trader.subtitle")}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {/* K15: CSV exports (trader scope = own records) */}
          <ExportButtons entities={["instruments", "applications", "certificates"]} />
          <Link
            href="/trader/instruments/new"
            className="inline-flex items-center justify-center rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
          >
            {t("trader.addInstrument")}
          </Link>
        </div>
      </div>

      {/* KPI Cards & Instrument Validity Ring Row */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {t("trader.validityTitle")}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          {instruments.map((ins) => {
            const cert = certOf(ins);
            return (
              <div
                key={ins.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 transition hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-base font-bold text-zinc-900 dark:text-white">
                    {ins.serialNumber}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {ins.category} · {ins.capacity}
                  </span>
                  <div className="mt-1">
                    {cert ? (
                      <StatusChip status={cert.status} />
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        {t("status.NO_CERTIFICATE")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="pl-4">
                  {cert ? (
                    <CountdownRing validFrom={cert.validFrom} validUntil={cert.validUntil} size={74} label={t("trader.validity")} />
                  ) : (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      {t("trader.ringAppears")}
                      <br />
                      {t("trader.afterFirstPass")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {instruments.length === 0 && !loading && (
            <div className="col-span-full rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              {t("trader.noInstrumentsCard")}
            </div>
          )}
        </div>
      </div>

      {/* Summary Stat Grid */}
      {dash && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {dash.pendingApplications}
            </div>
            <div className="text-xs text-zinc-500">{t("trader.pendingApplications")}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {dash.verifiedThisMonth}
            </div>
            <div className="text-xs text-zinc-500">{t("trader.verifiedThisMonth")}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-bold text-amber-500 dark:text-amber-400">
              {dash.expiringIn30d}
            </div>
            <div className="text-xs text-zinc-500">{t("trader.expiringIn30")}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-bold text-rose-500 dark:text-rose-400">
              {dash.slaBreaches}
            </div>
            <div className="text-xs text-zinc-500">{t("trader.slaBreaches")}</div>
          </div>
        </div>
      )}

      {/* Instruments Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-md shadow-zinc-950/5 overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/75 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            {t("trader.registeredInstruments")}
          </h2>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {instruments.length} {t("common.total")}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/25 dark:text-zinc-400">
              <tr>
                <th className="px-5 py-3">{t("trader.colSerial")}</th>
                <th className="px-5 py-3">{t("trader.colCategory")}</th>
                <th className="px-5 py-3">{t("trader.colMakeModel")}</th>
                <th className="px-5 py-3">{t("trader.colDistrict")}</th>
                <th className="px-5 py-3">{t("trader.colRegistered")}</th>
                <th className="px-5 py-3">{t("trader.colStatus")}</th>
                <th className="px-5 py-3 text-right">{t("trader.colAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {instruments.map((ins) => {
                const cert = certOf(ins);
                return (
                  <tr key={ins.id} className="transition hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                    <td className="px-5 py-3.5 font-mono font-semibold text-zinc-900 dark:text-white">
                      <Link href={`/trader/instruments/${ins.id}`} className="hover:underline">
                        {ins.serialNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-700 dark:text-zinc-300">
                      {ins.category}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-400">
                      {ins.make} {ins.model} ({ins.capacity})
                    </td>
                    <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{ins.district}</span>
                      <span className="block text-xs text-zinc-400">{ins.address}</span>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-400">
                      {new Date(ins.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5">
                      {cert ? (
                        <StatusChip status={cert.status} />
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/trader/apply/${ins.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                      >
                        {t("trader.apply")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {instruments.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-zinc-500">
                    {t("trader.noInstrumentsRow")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Applications List */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-md shadow-zinc-950/5 overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/75 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            {t("trader.applications")}
          </h2>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {applications.length} {t("common.submitted")}
          </span>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {applications.map((app) => {
            // human-readable labels: cuids are opaque, so show the instrument serial
            // (resolved from the already-fetched list) + a short app reference
            const serial = instruments.find((i) => i.id === app.instrumentId)?.serialNumber;
            return (
              <Link
                key={app.id}
                href={`/trader/applications/${app.id}`}
                className="flex flex-col justify-between gap-3 p-4 transition hover:bg-zinc-50/70 sm:flex-row sm:items-center sm:px-5 sm:py-3.5 dark:hover:bg-zinc-800/40"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-white">
                      {serial ?? app.instrumentId}
                    </span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {app.type}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {t("common.application")} <span className="font-mono">APP-{app.id.slice(-6).toUpperCase()}</span>
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {app.preferredDate && (
                    <span className="text-xs text-zinc-500">
                      {t("trader.preferred")} {new Date(app.preferredDate).toLocaleDateString()}
                    </span>
                  )}
                  <StatusChip status={app.status} />
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">{t("trader.details")}</span>
                </div>
              </Link>
            );
          })}
          {applications.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-zinc-500">
              {t("trader.noApplications")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}