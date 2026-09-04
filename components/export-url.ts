export type ExportEntity = "instruments" | "applications" | "certificates";

export const EXPORT_LABELS: Record<ExportEntity, string> = {
  instruments: "Instruments",
  applications: "Applications",
  certificates: "Certificates",
};

// AUDIT FINDING #54: only export-relevant filters are forwarded — the current
// page's arbitrary query string is NOT carried into export URLs, so stale UI
// filters can never silently affect exports if the route grows more filters.
const EXPORT_FILTERS = ["district", "category", "status"] as const;

/** GET /reports/export URL for an entity. Forwards only whitelisted filter
 *  params on top of the required params. Pure — unit-tested in
 *  export-buttons.test.ts. Lives in its own .ts module so tests can import it
 *  without pulling the JSX component into vitest. */
export function buildExportUrl(entity: ExportEntity, currentSearch = ""): string {
  const current = new URLSearchParams(currentSearch.replace(/^\?/, ""));
  const params = new URLSearchParams();
  for (const key of EXPORT_FILTERS) {
    const value = current.get(key);
    if (value) params.set(key, value);
  }
  params.set("entity", entity);
  params.set("format", "csv"); // endpoint rejects xlsx — csv only until MA5
  return `/api/v1/reports/export?${params.toString()}`;
}