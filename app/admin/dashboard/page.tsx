"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError, zodFieldErrors } from "@/components/api-client";
import { ExportButtons } from "@/components/export-buttons";
import { DISTRICTS } from "@/packages/shared/constants";
import type { DashCounts } from "@/packages/shared/types";

// GET /dashboards/admin payload (MA4 item 4)
interface AdminDash {
  kpis: DashCounts;
  pendencyByDistrict?: { district: string; pending: number }[];
  officerProductivity?: { name: string; inspectionsThisMonth: number }[];
}

const KPIS: { key: keyof DashCounts; label: string; desc: string; color: string }[] = [
  { key: "pendingApplications", label: "Pending Applications", desc: "Awaiting inspection assignment", color: "text-zinc-900 dark:text-white" },
  { key: "verifiedThisMonth", label: "Verified This Month", desc: "Certificates actively issued", color: "text-emerald-600 dark:text-emerald-400" },
  { key: "expiringIn30d", label: "Expiring in 30 Days", desc: "Mandatory renewal window", color: "text-amber-500 dark:text-amber-400" },
  { key: "slaBreaches", label: "SLA Breaches", desc: "Exceeded 14-day turnaround", color: "text-rose-600 dark:text-rose-400" },
];

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white";

export default function AdminDashboardPage() {
  const [dash, setDash] = useState<AdminDash | null>(null);

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
      .catch(() => undefined);
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
        text: `✓ Invited ${res.user.email} — temp password ${res.tempPassword} — ${res.banner}.`,
      });
      setInvite({ name: "", email: "", role: "LMO", district: DISTRICTS[0], orgName: "" });
    } catch (err) {
      const fields = err instanceof ApiError ? zodFieldErrors(err.details) : null;
      const first = fields ? Object.values(fields)[0]?.[0] : null;
      setInviteMsg({ ok: false, text: first ?? (err instanceof ApiError ? err.message : "Invite failed") });
    } finally {
      setInviting(false);
    }
  }

  const pendency = dash?.pendencyByDistrict;

  return (
    <div className="flex flex-col gap-8">
      <div className="border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
          State / District Administration
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          State-wide Legal Metrology verification throughput, SLA compliance metrics, and district oversight.
        </p>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => (
          <div
            key={k.key}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className={`text-3xl font-black ${k.color}`}>{dash ? dash.kpis[k.key] : "–"}</div>
            <div className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{k.label}</div>
            <div className="mt-0.5 text-xs text-zinc-400">{k.desc}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* District Pendency (only when the payload includes it) */}
        {pendency && (
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/75 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Pending by District</h2>
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                {pendency.length} districts
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-5 py-2.5">District</th>
                  <th className="px-5 py-2.5 text-right">Pending</th>
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
                      No pending applications.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Export + public key */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-base font-bold text-zinc-900 dark:text-white">Audit Trail &amp; Reports Export</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Download statutory compliance CSV exports and review Ed25519 digital signature keys.
          </p>
          <ExportButtons entities={["instruments", "applications", "certificates"]} />
          <Link
            href="/api/v1/.well-known/pramanam-public-key"
            target="_blank"
            className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span>🔑 View Ed25519 Public Key Certificate</span>
            <span>→</span>
          </Link>
        </div>

        {/* Invite user (MA5) */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-2 text-base font-bold text-zinc-900 dark:text-white">Invite Officer</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Create an LMO/GATC account. Credentials (temp password) must be shared offline by the admin.
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
              placeholder="Full name"
              value={invite.name}
              onChange={(e) => setInvite({ ...invite, name: e.target.value })}
              className={inputCls}
            />
            <input
              required
              type="email"
              placeholder="Email"
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
              placeholder="Organisation"
              value={invite.orgName}
              onChange={(e) => setInvite({ ...invite, orgName: e.target.value })}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              {inviting ? "Inviting…" : "Send invite →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}