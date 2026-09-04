"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function DocsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
          {t("docs.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("docs.subtitle")}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20 space-y-4">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          {t("docs.openapiTitle")}
        </h2>
        <p className="text-xs text-zinc-500">
          {t("docs.openapiDesc")}
        </p>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link
            href="/api/v1/openapi.json"
            target="_blank"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
          >
            <span>{t("docs.viewOpenapi")}</span>
            <span>↗</span>
          </Link>
          <Link
            href="/api/v1/.well-known/pramanam-public-key"
            target="_blank"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 transition outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <span>{t("docs.publicKey")}</span>
            <span>↗</span>
          </Link>
        </div>
      </div>
    </div>
  );
}