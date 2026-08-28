import Link from "next/link";

const portals = [
  {
    title: "Public Certificate Verification",
    href: "/verify/PRM-CERT-2026-00001",
    desc: "Verify Ed25519 digital signatures, validity status, and seal authenticity of any legal metrology certificate.",
    badge: "No Login Required",
    color: "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20",
    cta: "Verify Certificate →",
  },
  {
    title: "Trader Portal",
    href: "/trader",
    desc: "Register weighing & measuring instruments, track validity countdowns, and apply for annual/biennial verification.",
    badge: "Commercial / Trader",
    color: "border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/20",
    cta: "Open Trader Portal →",
  },
  {
    title: "Officer Inspection Queue",
    href: "/officer",
    desc: "Field officer workload queue, GPS tagging, photo evidence capture, and statutory verification approvals.",
    badge: "LMO / GATC",
    color: "border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/20",
    cta: "Access Inspection Queue →",
  },
  {
    title: "State / District Administration",
    href: "/admin",
    desc: "Oversight dashboard, SLA monitoring, compliance exports, and jurisdictional officer allocation control.",
    badge: "State Admin",
    color: "border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/20",
    cta: "View Admin Dashboard →",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      {/* Hero Section */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-12 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Legal Metrology Act, 2009 Digital Platform
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
            PRAMANAM
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-300">
            National Online Verification &amp; Tamper-Evident Digital Certification System for Commercial Weighing &amp; Measuring Instruments.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/verify/PRM-CERT-2026-00001"
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              Verify Sample Certificate
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Sign In to Portal
            </Link>
          </div>
        </div>
      </div>

      {/* Portals Grid */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">
          Core System Portals
        </h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {portals.map((portal) => (
            <Link
              key={portal.href}
              href={portal.href}
              className={`group flex flex-col justify-between rounded-xl border p-6 transition shadow-sm hover:border-zinc-400 dark:hover:border-zinc-600 ${portal.color}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-bold text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    {portal.badge}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:underline">
                  {portal.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {portal.desc}
                </p>
              </div>

              <div className="mt-5 font-semibold text-xs text-zinc-900 dark:text-white">
                {portal.cta}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}