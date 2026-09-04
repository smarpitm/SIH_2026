"use client";

import { useTranslation } from "@/lib/i18n";

// Footer copy goes through t() so the sitewide EN/HI toggle covers it too.
// Lives in its own client component because app/layout.tsx is a server component.
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-zinc-200/80 bg-white/80 py-6 text-center text-xs text-zinc-500 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">PRAMANAM</span>
          <span>—</span>
          <span>{t("footer.platform")}</span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-accent" />
        </div>
        <div className="font-mono text-[11px] tracking-tight text-zinc-400 dark:text-zinc-500">
          {t("footer.legal")}
        </div>
      </div>
    </footer>
  );
}