import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

// book MA4 item 6 — GET /reports/export?entity=instruments|applications|certificates&format=csv
// ADMIN all · LMO district · TRADER own. CSV stream with header row + Content-Disposition.
// EXCEL-SAFE: prefix text cells starting with = + - @ with '; UTF-8 BOM.
// format=xlsx → 400 VALIDATION_ERROR "csv only" (xlsx is MA5, degradable).

type Entity = "instruments" | "applications" | "certificates";

const HEADERS: Record<Entity, string[]> = {
  instruments: ["id", "category", "make", "model", "serialNumber", "capacity", "district", "address", "createdAt"],
  applications: ["id", "instrumentId", "traderId", "traderName", "traderPhone", "type", "status", "preferredDate", "feeAmount", "feePaidAt", "declarationAccepted", "createdAt"],
  certificates: ["id", "certId", "applicationId", "instrumentId", "status", "validFrom", "validUntil", "issuedById", "issuedByKind", "createdAt"],
};

/** Excel-safe cell: prefix `'` when a text cell starts with =+-@ ; quote when it
 *  contains a comma, quote or newline (standard CSV escaping). */
function excelSafe(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(excelSafe).join(",")];
  for (const row of rows) lines.push(row.map(excelSafe).join(","));
  return "\uFEFF" + lines.join("\r\n"); // UTF-8 BOM + CRLF
}

export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const url = new URL(req.url);
  const entity = url.searchParams.get("entity");
  const format = url.searchParams.get("format");

  if (format === "xlsx") return jsonErr("VALIDATION_ERROR", "csv only");
  // ponytail: xlsx export — no 1-dep SheetML writer is installed in the repo, so per
  // book MA5 item 2 this stays CSV-only. Ceiling: xlsx until a dep is added.
  // Upgrade path: add the `xlsx` dep and emit a minimal workbook in this route.
  if (format && format !== "csv") {
    return jsonErr("VALIDATION_ERROR", "unsupported format — only csv");
  }
  if (entity !== "instruments" && entity !== "applications" && entity !== "certificates") {
    return jsonErr("VALIDATION_ERROR", "entity must be instruments | applications | certificates");
  }
  if (!format) {
    return jsonErr("VALIDATION_ERROR", "format=csv is required");
  }

  const role = session!.role;
  const uid = session!.userId;
  const district = session!.district ?? "__none__";

  const scope: Prisma.InstrumentWhereInput | Prisma.ApplicationWhereInput | Prisma.CertificateWhereInput =
    role === "ADMIN"
      ? {}
      : role === "LMO" || role === "GATC"
        ? entity === "instruments"
          ? { district }
          : { instrument: { district } }
        : entity === "instruments"
          ? { ownerId: uid }
          : entity === "applications"
            ? { traderId: uid }
            : { instrument: { ownerId: uid } };

  let rows: unknown[][];
  if (entity === "instruments") {
    const data = await db.instrument.findMany({ where: scope as Prisma.InstrumentWhereInput, orderBy: { createdAt: "asc" } });
    rows = data.map((r) => [r.id, r.category, r.make, r.model, r.serialNumber, r.capacity, r.district, r.address, r.createdAt.toISOString()]);
  } else if (entity === "applications") {
    // promptbook_phone Prompt 4: officer/admin exports carry the trader's name
    // + phone ("—" when a legacy user has none). TRADER scope (own exports)
    // never includes the phone — the cells come back empty for them.
    const officerView = role === "ADMIN" || role === "LMO" || role === "GATC";
    const data = await db.application.findMany({
      where: scope as Prisma.ApplicationWhereInput,
      orderBy: { createdAt: "asc" },
      ...(officerView
        ? { include: { instrument: { select: { district: true } } } }
        : {}),
    });
    const traderIds = Array.from(new Set(data.map((r) => r.traderId)));
    const traders = officerView && traderIds.length
      ? await db.user.findMany({ where: { id: { in: traderIds } }, select: { id: true, name: true, phone: true } })
      : [];
    const traderBy = new Map(traders.map((t) => [t.id, t]));
    rows = data.map((r) => {
      const trader = officerView ? traderBy.get(r.traderId) : undefined;
      return [
        r.id, r.instrumentId, r.traderId,
        officerView ? trader?.name ?? "" : "",
        officerView ? trader?.phone ?? "—" : "",
        r.type, r.status,
        r.preferredDate?.toISOString() ?? "", r.feeAmount, r.feePaidAt?.toISOString() ?? "",
        String(r.declarationAccepted), r.createdAt.toISOString(),
      ];
    });
  } else {
    const data = await db.certificate.findMany({ where: scope as Prisma.CertificateWhereInput, orderBy: { createdAt: "asc" } });
    rows = data.map((r) => [
      r.id, r.certId, r.applicationId, r.instrumentId, r.status,
      r.validFrom.toISOString(), r.validUntil.toISOString(), r.issuedById, r.issuedByKind, r.createdAt.toISOString(),
    ]);
  }

  return new Response(toCsv(HEADERS[entity], rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${entity}.csv"`,
    },
  });
}

// keep jsonOk referenced for envelope parity if any future flow needs it
void jsonOk;