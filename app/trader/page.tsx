"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { CountdownRing } from "@/components/CountdownRing";
import { StatusBadge, MetricCard, EmptyState } from "@/components/ui";
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
  // P0#1 progressive disclosure: the ring grid shows the first N instruments
  // (full list lives in the searchable table below); applications cap at N.
  const [instrumentQuery, setInstrumentQuery] = useState("");
  // Print/download the certificate PDF straight from the dashboard (ring card
  // + table ACTION cell). The PDF endpoint does its own authz and answers with
  // a short-lived presigned URL — open it in a new tab, no token handling.
  const [certBusyId, setCertBusyId] = useState<string | null>(null);

  async function printCertificate(certId: string) {
    if (certBusyId) return;
    setCertBusyId(certId);
    try {
      const { url } = await api<{ url: string }>(`/api/v1/certificates/${certId}/pdf`);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener,noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // silent on the dashboard — the application detail page surfaces errors
    } finally {
      setCertBusyId(null);
    }
  }
  const [showAllApps, setShowAllApps] = useState(false);
  const RING_LIMIT = 6;
  const APP_LIMIT = 5; // review: "Only 4-5 rows" for recent applications

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

  // table search: serial / category / make / model, case-insensitive
  const q = instrumentQuery.trim().toLowerCase();
  const visibleInstruments = q
    ? instruments.filter(
        (i) =>
          i.serialNumber.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.make.toLowerCase().includes(q) ||
          i.model.toLowerCase().includes(q)
      )
    : instruments;
  const visibleApplications = showAllApps ? applications : applications.slice(0, APP_LIMIT);

  // Validity from the latest certificate when the payload includes one
  const certOf = (ins: InstrumentWithCert) => ins.certificate;

  // "What happens next" — every application row tells the trader the next step
  // so nobody wonders what happens after submitting.
  const nextAction = (status: string): { label: string; tone: "muted" | "amber" | "emerald" } => {
    switch (status) {
      case "DRAFT":
        return { label: t("trader.next.draft", "Complete & submit this draft"), tone: "amber" };
      case "SUBMITTED":
        return { label: t("trader.next.submitted", "Awaiting officer review"), tone: "muted" };
      case "SCHEDULED":
        return { label: t("trader.next.scheduled", "Prepare for the scheduled inspection"), tone: "muted" };
      case "CHECKED_IN":
        return { label: t("trader.next.checkedIn", "Inspection in progress"), tone: "muted" };
      case "PASSED":
        return { label: t("trader.next.passed", "Certificate being issued"), tone: "emerald" };
      case "CERT_ISSUED":
        return { label: t("trader.next.certIssued", "Certificate active — view & print"), tone: "emerald" };
      case "REJECTED":
        return { label: t("trader.next.rejected", "View reason and reapply"), tone: "amber" };
      default:
        return { label: t("trader.next.default", "Tracking updates will appear here"), tone: "muted" };
    }
  };

  // Action Required: drafts to finish + rejected applications to act on
  const actionRequired = applications.filter((a) => a.status === "DRAFT" || a.status === "REJECTED");

  // 4 compact metrics the review asked for, all derivable from loaded data:
  // Instruments | Pending | Certified | Action Required
  const kpiInstruments = instruments.length;
  const kpiPending = applications.filter((a) =>
    ["DRAFT", "SUBMITTED", "SCHEDULED", "CHECKED_IN"].includes(a.status)
  ).length;
  const kpiCertified = applications.filter((a) => a.status === "CERT_ISSUED").length;

  // time-of-day greeting ("Good morning, Trader") so the first viewport answers
  // "what is my day?" instead of opening with a data wall
  const hour = new Date().getHours();
  const greetKey =
    hour < 12 ? "trader.greetMorning" : hour < 17 ? "trader.greetAfternoon" : "trader.greetEvening";

  return (
    <div className="flex flex-col gap-8">
      {/* Top Header — greeting first, then the portal actions */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
            {t(greetKey)} {t("trader.roleWord", "Trader")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("trader.greetSub", "Here's what's happening with your instruments.")}
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

      {/* Summary Stat Grid — the "what do I need to know" row, above the fold */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-4">
              <div className="skeleton h-8 w-12" />
              <div className="skeleton mt-1 h-3 w-20" />
            </div>
          ))}
        </div>
      ) : (
        dash && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label={t("trader.kpiInstruments", "Instruments")} value={kpiInstruments} />
            <MetricCard label={t("trader.kpiPending", "Pending")} value={kpiPending} tone="warning" />
            <MetricCard label={t("trader.kpiCertified", "Certified")} value={kpiCertified} tone="success" />
            <MetricCard label={t("trader.kpiActionRequired", "Action Required")} value={actionRequired.length} tone="danger" />
          </div>
        )
      )}

      {/* Action Required — drafts & rejections that need the trader's attention */}
      {actionRequired.length > 0 && (
        <section aria-labelledby="action-required">
          <h2 id="action-required" className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <span aria-hidden="true">⚠</span> {t("trader.actionRequired", "Action Required")}
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              {actionRequired.length}
            </span>
          </h2>
          <div className="space-y-2">
            {actionRequired.map((app) => {
              const serial = instruments.find((i) => i.id === app.instrumentId)?.serialNumber;
              const na = nextAction(app.status);
              return (
                <Link
                  key={app.id}
                  href={`/trader/applications/${app.id}`}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 transition hover:bg-amber-50 sm:flex-row sm:items-center dark:border-amber-800/40 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-white">
                        APP-{app.id.slice(-6).toUpperCase()}
                      </span>
                      <StatusBadge status={app.status} size="sm" />
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {serial ?? app.instrumentId} · <span className="font-medium">{na.label}</span>
                    </p>
                  </div>
                  {/* strong primary CTA per action row — "Renew Certificate →" style */}
                  <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-950 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200">
                    {app.status === "DRAFT"
                      ? t("trader.ctaContinue", "Continue application")
                      : t("trader.ctaReapply", "Reapply")}{" "}
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Applications — first APP_LIMIT rows; the full list lives behind "Show all" */}
      <section aria-label={t("trader.recentTitle", "Recent Applications")}>
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t("trader.recentTitle", "Recent Applications")}
          </h2>
          {applications.length > APP_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllApps((v) => !v)}
              className="shrink-0 text-xs font-semibold text-accent-700 transition-colors hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200"
            >
              {showAllApps
                ? t("trader.showLessApplications", "Show fewer") + " ↑"
                : t("trader.showAllApplications", "Show all") + " ↓"}
            </button>
          )}
        </div>
        <div className="mt-1 divide-y divide-zinc-200 dark:divide-zinc-800">
          {visibleApplications.map((app) => {
            const serial = instruments.find((i) => i.id === app.instrumentId)?.serialNumber;
            return (
              <Link
                key={app.id}
                href={`/trader/applications/${app.id}`}
                className="flex flex-col justify-between gap-3 p-4 transition hover:bg-zinc-50/70 sm:flex-row sm:items-center sm:px-1 sm:py-3 dark:hover:bg-zinc-800/40"
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
                    <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
                    <span
                      className={
                        nextAction(app.status).tone === "amber"
                          ? "font-medium text-amber-600 dark:text-amber-400"
                          : nextAction(app.status).tone === "emerald"
                            ? "font-medium text-emerald-600 dark:text-emerald-400"
                            : ""
                      }
                    >
                      {nextAction(app.status).label}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {app.preferredDate && (
                    <span className="text-xs text-zinc-500">
                      {t("trader.preferred")} {new Date(app.preferredDate).toLocaleDateString()}
                    </span>
                  )}
                  <StatusBadge status={app.status} />
                </div>
              </Link>
            );
          })}
          {applications.length === 0 && !loading && (
            <EmptyState
              icon="✎"
              title={t("trader.noApplicationsTitle", "No Applications Yet")}
              description={t(
                "trader.noApplicationsDesc",
                "Your submitted verification applications will appear here."
              )}
              action={
                <Link href="/trader/instruments/new" className="btn btn-primary btn-sm">
                  {t("trader.noApplicationsCta", "Register an Instrument")}
                </Link>
              }
            />
          )}
        </div>
      </section>

      {/* Instrument Validity Rings — first N only; the searchable table below holds the full list */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t("trader.validityTitle")}
          </h2>
          {instruments.length > RING_LIMIT && (
            <a
              href="#trader-instruments"
              className="shrink-0 text-xs font-semibold text-accent-700 transition-colors hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200"
            >
              {t("trader.viewAllInstruments", "View all")} {instruments.length} →
            </a>
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          {instruments.slice(0, RING_LIMIT).map((ins) => {
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
                <div className="flex flex-col items-end gap-2 pl-4">
                  {cert ? (
                    <CountdownRing validFrom={cert.validFrom} validUntil={cert.validUntil} size={74} label={t("trader.validity")} />
                  ) : (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      {t("trader.ringAppears")}
                      <br />
                      {t("trader.afterFirstPass")}
                    </span>
                  )}
                  {/* print the certificate right from the card — no need to
                      open the instrument or application page first */}
                  {cert && (
                    <button
                      type="button"
                      onClick={() => printCertificate(cert.certId)}
                      disabled={certBusyId === cert.certId}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-600 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition outline-none hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                    >
                      {certBusyId === cert.certId
                        ? t("appd.cert.preparing", "Preparing PDF…")
                        : t("trader.printCert", "🖨 Print Certificate")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {instruments.length === 0 && !loading && (
            <div className="col-span-full">
              <EmptyState
                icon="▤"
                title={t("trader.noInstrumentsTitle", "No Instruments Registered Yet")}
                description={t(
                  "trader.noInstrumentsDesc",
                  "Register your weighing or measuring instrument to begin the verification process."
                )}
                action={
                  <Link href="/trader/instruments/new" className="btn btn-primary btn-sm">
                    {t("trader.addInstrument")}
                  </Link>
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Instruments Table (id anchors the "View all" ring link) */}
      <div id="trader-instruments" className="scroll-mt-24 rounded-xl border border-zinc-200 bg-white shadow-md shadow-zinc-950/5 overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/75 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            {t("trader.registeredInstruments")}
          </h2>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {visibleInstruments.length} {t("common.total")}
          </span>
        </div>
        {/* table search — progressive disclosure over a long instrument list */}
        <div className="border-b border-zinc-200 bg-zinc-50/50 px-5 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/25">
          <div className="relative max-w-sm">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
              ⌕
            </span>
            <input
              type="search"
              value={instrumentQuery}
              onChange={(e) => setInstrumentQuery(e.target.value)}
              placeholder={t("trader.searchInstruments", "Search serial, category, make…")}
              aria-label={t("trader.searchInstruments", "Search instruments")}
              className="field-input pl-8"
            />
          </div>
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
              {visibleInstruments.map((ins) => {
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
                      {cert ? (
                        /* certified instrument → print its certificate */
                        <button
                          type="button"
                          onClick={() => printCertificate(cert.certId)}
                          disabled={certBusyId === cert.certId}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition outline-none hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                        >
                          {certBusyId === cert.certId
                            ? t("appd.cert.preparing", "Preparing PDF…")
                            : t("trader.printCert", "🖨 Print Certificate")}
                        </button>
                      ) : (
                        <Link
                          href={`/trader/apply/${ins.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                        >
                          {t("trader.apply")}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleInstruments.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-zinc-500">
                    {q
                      ? t("trader.noMatchInstruments", "No instruments match your search.")
                      : t("trader.noInstrumentsRow")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}