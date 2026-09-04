"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError, zodFieldErrors } from "@/components/api-client";
import { ExportButtons } from "@/components/export-buttons";
import { useTranslation } from "@/lib/i18n";
import { DISTRICTS } from "@/packages/shared/constants";
import type { DashCounts } from "@/packages/shared/types";

// GET /dashboards/admin payload (MA4 item 4)
interface AdminDash {
  kpis: DashCounts;
  pendencyByDistrict?: { district: string; pending: number }[];
  officerProductivity?: { name: string; inspectionsThisMonth: number }[];
}

// i18n: KPIs render labels/descriptions through t() (keys below) so the EN/HI
// toggle applies; the value stays a plain number.
const KPIS: { key: keyof DashCounts; labelKey: string; descKey: string; color: string }[] = [
  { key: "pendingApplications", labelKey: "trader.pendingApplications", descKey: "admin.kpiDesc1", color: "text-zinc-900 dark:text-white" },
  { key: "verifiedThisMonth", labelKey: "trader.verifiedThisMonth", descKey: "admin.kpiDesc2", color: "text-emerald-600 dark:text-emerald-400" },
  { key: "expiringIn30d", labelKey: "trader.expiringIn30", descKey: "admin.kpiDesc3", color: "text-amber-500 dark:text-amber-400" },
  { key: "slaBreaches", labelKey: "trader.slaBreaches", descKey: "admin.kpiDesc4", color: "text-rose-600 dark:text-rose-400" },
];

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40";

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [dash, setDash] = useState<AdminDash | null>(null);
  const [dashError, setDashError] = useState(false);

  // invite-user miniform (MA5 item 1: POST /auth/invite, ADMIN only)
  const [invite, setInvite] = useState<{ name: string; email: string; role: string; district: string; orgName: string }>({
    name: "",
    email: "",
    role: "LMO",
    district: DISTRICTS[0],
    orgName: "",
  });
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<AdminDash>("/api/v1/dashboards/admin")
      .then(setDash)
      .catch(() => setDashError(true));
  }, []);

  async function submitInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await api<{ user: { email: string }; tempPassword: string; banner: string }>(
        "/api/v1/auth/invite",
        { method: "POST", body: JSON.stringify(invite) }
      );
      setInviteMsg({
        ok: true,
        text: `${t("admin.invited")} ${res.user.email} — ${t("admin.tempPassword")} ${res.tempPassword} — ${res.banner}.`,
      });
      setInvite({ name: "", email: "", role: "LMO", district: DISTRICTS[0], orgName: "" });
    } catch (err) {
      const fields = err instanceof ApiError ? zodFieldErrors(err.details) : null;
      const first = fields ? Object.values(fields)[0]?.[0] : null;
      setInviteMsg({ ok: false, text: first ?? (err instanceof ApiError ? err.message : t("admin.inviteFailed")) });
    } finally {
      setInviting(false);
    }
  }

  const pendency = dash?.pendencyByDistrict;

  return (
    <div className="flex flex-col gap-8">
      <div className="border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
          {t("admin.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("admin.subtitle")}
        </p>
      </div>

      {/* Loading / error state for the dashboard fetch (one sentence each) */}
      {dashError && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          role="status"
        >
          {t("admin.loadError")}
        </div>
      )}
      {!dash && !dashError && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          {t("admin.loading")}
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => (
          <div
            key={k.key}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20"
          >
            <div className={`text-3xl font-black ${k.color}`}>{dash ? dash.kpis[k.key] : "–"}</div>
            <div className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t(k.labelKey)}</div>
            <div className="mt-0.5 text-xs text-zinc-400">{t(k.descKey)}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* District Pendency (only when the payload includes it) */}
        {pendency && (
          <div className="rounded-xl border border-zinc-200 bg-white shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/75 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">{t("admin.pendingByDistrict")}</h2>
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                {pendency.length} {t("admin.districtsCount")}
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-5 py-2.5">{t("common.district")}</th>
                  <th className="px-5 py-2.5 text-right">{t("admin.colPending")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {pendency.map((p) => (
                  <tr key={p.district}>
                    <td className="px-5 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">{p.district}</td>
                    <td className="px-5 py-2.5 text-right font-bold text-zinc-900 dark:text-white">{p.pending}</td>
                  </tr>
                ))}
                {pendency.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-5 py-6 text-center text-zinc-500">
                      {t("admin.noPending")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Export + public key */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
          <h2 className="mb-2 text-base font-bold text-zinc-900 dark:text-white">{t("admin.auditExport")}</h2>
          <p className="mb-4 text-xs text-zinc-500">
            {t("admin.auditExportDesc")}
          </p>
          <ExportButtons entities={["instruments", "applications", "certificates"]} />
          <Link
            href="/api/v1/.well-known/pramanam-public-key"
            target="_blank"
            className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-xs font-semibold text-zinc-800 transition outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span>{t("admin.publicKey")}</span>
            <span>→</span>
          </Link>
        </div>

        {/* Invite user (MA5) */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-2 text-base font-bold text-zinc-900 dark:text-white">{t("admin.inviteTitle")}</h2>
          <p className="mb-4 text-xs text-zinc-500">
            {t("admin.inviteDesc")}
          </p>
          {inviteMsg && (
            <p
              className={`mb-4 rounded-lg px-3 py-2 text-xs font-semibold ${
                inviteMsg.ok
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
              }`}
              role="status"
            >
              {inviteMsg.text}
            </p>
          )}
          <form onSubmit={submitInvite} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <input
              required
              placeholder={t("admin.phName")}
              value={invite.name}
              onChange={(e) => setInvite({ ...invite, name: e.target.value })}
              className={inputCls}
            />
            <input
              required
              type="email"
              placeholder={t("admin.phEmail")}
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              className={inputCls}
            />
            <select
              value={invite.role}
              onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              className={inputCls}
            >
              <option value="LMO">LMO</option>
              <option value="GATC">GATC</option>
            </select>
            <select
              value={invite.district}
              onChange={(e) => setInvite({ ...invite, district: e.target.value })}
              className={inputCls}
            >
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              required
              placeholder={t("admin.phOrg")}
              value={invite.orgName}
              onChange={(e) => setInvite({ ...invite, orgName: e.target.value })}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center justify-center rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
            >
              {inviting ? t("admin.inviting") : t("admin.sendInvite")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}