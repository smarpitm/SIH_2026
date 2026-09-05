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

// HOW IT WORKS — the end-to-end statutory lifecycle (home.f1..f5.*)
const flow = [
  { k: "f1", icon: "▤", title: "Register Instrument", desc: "Trader records the instrument with photo proof and serial number." },
  { k: "f2", icon: "✎", title: "Submit Application", desc: "Verification application filed with declaration and fee." },
  { k: "f3", icon: "◉", title: "Officer Inspection", desc: "Authorized LMO/GATC officer inspects on site with GPS + photo evidence." },
  { k: "f4", icon: "✓", title: "Digital Verification", desc: "Result recorded; Ed25519-signed certificate is generated." },
  { k: "f5", icon: "▣", title: "Certificate Issued", desc: "Anyone can verify the certificate online — no login required." },
];

export default function Home() {
  const { t } = useTranslation();

  const trustItems = [
    { k: "t1", icon: "🔐", label: t("home.trust.t1", "Ed25519 Tamper-Evident"), desc: t("home.trust.t1d", "Cryptographically signed certificates") },
    { k: "t2", icon: "⚖", label: t("home.trust.t2", "Legal Metrology Act 2009"), desc: t("home.trust.t2d", "Statutory verification workflow") },
    { k: "t3", icon: "📶", label: t("home.trust.t3", "Offline Verification"), desc: t("home.trust.t3d", "Field verification without internet") },
    { k: "t4", icon: "▦", label: t("home.trust.t4", "Full Audit Trail"), desc: t("home.trust.t4d", "Every action recorded and traceable") },
  ];

  return (
    <div className="flex flex-col gap-10">
      {/* Hero — WHAT the platform is, WHO it serves, WHY it matters */}
      <div className="card overflow-hidden">
        <div className="border-b border-zinc-100 bg-zinc-50/60 p-8 sm:p-10 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-200 bg-accent-50 px-3 py-1 text-xs font-semibold tracking-tight text-accent-800 dark:border-accent-400/20 dark:bg-accent-400/10 dark:text-accent-300">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
              {t("home.badge")}
            </div>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-4xl dark:text-white">
              {t("home.heroTitle", "Digital Verification for Weights & Measures")}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-300">
              {t("home.heroSub", "End-to-end certification, inspection and verification for commercial weighing and measuring instruments — faster, transparent and tamper-resistant.")}
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {t("home.subtitle")}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className="btn btn-primary">
                {t("home.getStarted", "Get Started")}
              </Link>
              <Link href="/verify/PRM-CERT-2026-00001" className="btn btn-secondary">
                {t("home.verifySample", "Verify a Certificate")}
              </Link>
              <Link href="/login" className="btn btn-ghost">
                {t("home.signIn")}
              </Link>
            </div>
          </div>
        </div>

        {/* Trust strip — statutory credibility, not marketing */}
        <div className="grid grid-cols-2 divide-zinc-100 sm:grid-cols-4 sm:divide-x dark:divide-zinc-800">
          {trustItems.map((tr) => (
            <div key={tr.k} className="flex items-start gap-2.5 px-4 py-4 sm:px-5">
              <span aria-hidden="true" className="text-base leading-none">{tr.icon}</span>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-zinc-900 dark:text-white">{tr.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{tr.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS — the 5-step statutory lifecycle */}
      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="section-title mb-4">
          {t("home.howTitle", "How It Works — Instrument to Verifiable Certificate")}
        </h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {flow.map((f, i) => (
            <li key={f.k} className="card relative p-4">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-bold text-white dark:bg-white dark:text-zinc-950"
                >
                  {i + 1}
                </span>
                <span aria-hidden="true" className="text-sm text-zinc-400 dark:text-zinc-500">{f.icon}</span>
              </div>
              <h3 className="mt-2.5 text-sm font-bold text-zinc-950 dark:text-white">
                {t(`home.${f.k}.title`, f.title)}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {t(`home.${f.k}.desc`, f.desc)}
              </p>
              {i < flow.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-2.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center text-[10px] text-zinc-300 lg:flex dark:text-zinc-600"
                >
                  ▸
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

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