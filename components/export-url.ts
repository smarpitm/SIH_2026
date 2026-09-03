export type ExportEntity = "instruments" | "applications" | "certificates";

export const EXPORT_LABELS: Record<ExportEntity, string> = {
  instruments: "Instruments",
  applications: "Applications",
  certificates: "Certificates",
};

/** GET /reports/export URL for an entity. Preserves the current page's query
 *  string (filters, when a page has any) on top of the required params. Pure —
 *  unit-tested in export-buttons.test.ts. Lives in its own .ts module so tests
 *  can import it without pulling the JSX component into vitest. */
export function buildExportUrl(entity: ExportEntity, currentSearch = ""): string {
  const params = new URLSearchParams(currentSearch.replace(/^\?/, ""));
  params.set("entity", entity);
  params.set("format", "csv"); // endpoint rejects xlsx — csv only until MA5
  return `/api/v1/reports/export?${params.toString()}`;
}