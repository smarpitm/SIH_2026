"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/store";
import { buildExportUrl, EXPORT_LABELS, type ExportEntity } from "./export-url";

/** CSV export buttons (MA4 item 6). Fetches with Bearer token, applies the
 *  endpoint's Content-Disposition filename (instruments.csv etc), and triggers
 *  download via blob URL with real completion handling. */
export function ExportButtons({ entities }: { entities: ExportEntity[] }) {
  const [busy, setBusy] = useState<ExportEntity | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(entity: ExportEntity) {
    setBusy(entity);
    setError(null);
    const url = buildExportUrl(entity, window.location.search);

    try {
      const token = useAuthStore.getState().accessToken;
      let res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      // Handle 401 token refresh if needed
      if (res.status === 401) {
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        const refreshData = await refreshRes.json().catch(() => null);
        if (refreshRes.ok && refreshData?.ok && refreshData.data?.accessToken) {
          const freshToken = refreshData.data.accessToken;
          const user = useAuthStore.getState().user;
          if (user) useAuthStore.getState().setAuth(user, freshToken);
          res = await fetch(url, {
            headers: { Authorization: `Bearer ${freshToken}` },
          });
        }
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message ?? `Export failed with status ${res.status}`);
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
      setError(err instanceof Error ? err.message : "Download failed");
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
            className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busy === e ? "Preparing…" : `⬇ ${EXPORT_LABELS[e]} CSV`}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {busy && (
          <div className="no-print fixed bottom-4 right-4 z-50 rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-zinc-900">
            Preparing {EXPORT_LABELS[busy]} export…
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