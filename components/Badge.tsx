const CONFIG: Record<string, { word: string; icon: string; cls: string; heroBg: string }> = {
  VALID: {
    word: "VALID",
    icon: "✓",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    heroBg: "bg-emerald-600 text-white shadow-emerald-600/25",
  },
  EXPIRING_SOON: {
    word: "EXPIRING SOON",
    icon: "⟳",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    heroBg: "bg-amber-500 text-white shadow-amber-500/25",
  },
  EXPIRED: {
    word: "EXPIRED",
    icon: "✕",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    heroBg: "bg-rose-600 text-white shadow-rose-600/25",
  },
  REVOKED: {
    word: "REVOKED",
    icon: "✕",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    heroBg: "bg-rose-700 text-white shadow-rose-700/25",
  },
  // display-only verdict (never a real BadgeDTO verdict) — signatureValid=false wins
  CHECK_FAILED: {
    word: "CHECK FAILED",
    icon: "✕",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    heroBg: "bg-rose-700 text-white shadow-rose-700/25",
  },
};

// a11y: aria-live announces the verdict; colour is never the only signal (icon + word always).
export function Badge({
  verdict,
  size = "md",
  className = "",
  word,
  subtitle,
}: {
  verdict: string;
  size?: "sm" | "md" | "hero";
  className?: string;
  word?: string; // i18n override — G6 verdict words come from lib/i18n t()
  subtitle?: string; // hero sub-line override (e.g. "SIGNATURE VERIFIED")
}) {
  const m = CONFIG[verdict] ?? {
    word: verdict,
    icon: "•",
    cls: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    heroBg: "bg-zinc-800 text-white",
  };

  if (size === "hero") {
    return (
      <div
        aria-live="polite"
        className={`flex min-h-[15vh] w-full flex-col items-center justify-center rounded-2xl p-6 text-center shadow-lg transition ${m.heroBg} ${className}`}
      >
        <span className="text-4xl font-extrabold sm:text-5xl" aria-hidden="true">
          {m.icon}
        </span>
        <span className="mt-1.5 text-2xl font-black tracking-wider sm:text-3xl">
          {word ?? m.word}
        </span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-widest opacity-90">
          {subtitle ?? "Official Legal Metrology Certificate"}
        </span>
      </div>
    );
  }

  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${m.cls} ${className}`}
    >
      <span aria-hidden="true">{m.icon}</span>
      {m.word}
    </span>
  );
}