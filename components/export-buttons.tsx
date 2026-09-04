"use client";

import { useState } from "react";
import { authorizedRequest } from "@/components/api-client";
import { useTranslation } from "@/lib/i18n";
import { buildExportUrl, type ExportEntity } from "./export-url";

// i18n keys per export entity — labels render through t() so the EN/HI toggle
// applies to the CSV buttons (CSV file format marker stays "CSV").
const LABEL_KEYS: Record<ExportEntity, string> = {
  instruments: "exp.instruments",
  applications: "exp.applications",
  certificates: "exp.certificates",
};

/** CSV export buttons (MA4 item 6). Downloads via the shared authorizedRequest
 *  (audit finding #55 — same single-flight Bearer + 401-refresh path as api()),
 *  applies the endpoint's Content-Disposition filename (instruments.csv etc),
 *  and triggers the download via blob URL with real completion handling. */
export function ExportButtons({ entities }: { entities: ExportEntity[] }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<ExportEntity | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(entity: ExportEntity) {
    setBusy(entity);
    setError(null);
    const url = buildExportUrl(entity, window.location.search);

    try {
      // shared 401-refresh path — never reimplement refresh here (audit finding #55)
      const res = await authorizedRequest(url);

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message ?? `${t("exp.failedStatus")} ${res.status}`);
      }

      // Extract filename from Content-Disposition
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
      const filename = match?.[1] ? match[1].trim() : `${entity}.csv`;

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("exp.downloadFailed"));
      window.setTimeout(() => setError(null), 4000);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-2">
        {entities.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => download(e)}
            disabled={busy !== null}
            className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busy === e ? t("exp.preparing") : `⬇ ${t(LABEL_KEYS[e])} CSV`}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {busy && (
          <div className="no-print fixed bottom-4 right-4 z-50 rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-zinc-900">
            {t("exp.preparingToast")}
          </div>
        )}
        {error && (
          <div className="no-print fixed bottom-4 right-4 z-50 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
            {error}
          </div>
        )}
      </div>
    </>
  );
}