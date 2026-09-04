"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

// i18n: each card maps to home.p{1..4}.* keys; English strings below are the
// frozen fallbacks if a key is ever missing.
const portals = [
  {
    k: "p1",
    href: "/verify/PRM-CERT-2026-00001",
    title: "Public Certificate Verification",
    desc: "Verify Ed25519 digital signatures, validity status, and seal authenticity of any legal metrology certificate.",
    badge: "No Login Required",
    color: "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20",
    cta: "Verify Certificate →",
  },
  {
    k: "p2",
    href: "/trader",
    title: "Trader Portal",
    desc: "Register weighing & measuring instruments, track validity countdowns, and apply for annual/biennial verification.",
    badge: "Commercial / Trader",
    color: "border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/20",
    cta: "Open Trader Portal →",
  },
  {
    k: "p3",
    href: "/officer",
    title: "Officer Inspection Queue",
    desc: "Field officer workload queue, GPS tagging, photo evidence capture, and statutory verification approvals.",
    badge: "LMO / GATC",
    color: "border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/20",
    cta: "Access Inspection Queue →",
  },
  {
    k: "p4",
    href: "/admin",
    title: "State / District Administration",
    desc: "Oversight dashboard, SLA monitoring, compliance exports, and jurisdictional officer allocation control.",
    badge: "State Admin",
    color: "border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/20",
    cta: "View Admin Dashboard →",
  },
];

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-10">
      {/* Hero Section */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-md shadow-zinc-950/5 sm:p-12 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent-200 bg-accent-50 px-3 py-1 text-xs font-semibold tracking-tight text-accent-800 dark:border-accent-400/20 dark:bg-accent-400/10 dark:text-accent-300">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
            {t("home.badge")}
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
            PRAMANAM
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-300">
            {t("home.subtitle")}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/verify/PRM-CERT-2026-00001"
              className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-lg hover:shadow-zinc-950/25 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
            >
              {t("home.verifySample")}
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition outline-none hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {t("home.signIn")}
            </Link>
          </div>
        </div>
      </div>

      {/* Portals Grid */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">
          {t("home.portals")}
        </h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {portals.map((portal) => (
            <Link
              key={portal.href}
              href={portal.href}
              className={`group flex flex-col justify-between rounded-xl border p-6 shadow-sm shadow-zinc-950/5 transition outline-none hover:-translate-y-0.5 hover:shadow-md hover:shadow-zinc-950/10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:shadow-black/20 dark:focus-visible:ring-offset-zinc-950 dark:hover:border-zinc-600 dark:hover:shadow-black/30 ${portal.color}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-bold tracking-tight text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    {t(`home.${portal.k}.badge`, portal.badge)}
                  </span>
                </div>
                <h3 className="text-lg font-bold tracking-tight text-zinc-950 dark:text-white group-hover:underline">
                  {t(`home.${portal.k}.title`, portal.title)}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {t(`home.${portal.k}.desc`, portal.desc)}
                </p>
              </div>

              <div className="mt-5 text-xs font-semibold text-zinc-950 transition-colors group-hover:text-accent-700 dark:text-white dark:group-hover:text-accent-300">
                {t(`home.${portal.k}.cta`, portal.cta)}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}