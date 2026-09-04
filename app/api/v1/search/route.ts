// GET /api/v1/search?q=<1..64 chars>[&district=&category=&status=]
// Smarpit (M7). PRD #11 — role-scoped record lookup. Postgres-only by design
// (explicit PRD anti-goal: no external search service). The frozen schema has
// no trigram index, so matching is ILIKE contains — fine at demo scale.
// ponytail: a pg_trgm GIN index over serialNumber/make/model/certId needs a
// migration; prisma/schema.prisma is FROZEN at K0, so it stays a chat note.
//
// Result item contract (for Kush's search renderer — keep in sync):
//   { kind:"instrument"|"certificate", id, title, subtitle, district, status, url }
//     instrument  -> id = instrument.id, url = /trader/instruments/[id]
//     certificate -> id = certId (public id, matches [certId]), url = /verify/[certId]
//   instrument.status is DERIVED from its latest certificate ("UNCERTIFIED"
//   when none) — the frozen schema has no status column on Instrument.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { DISTRICTS, INSTRUMENT_CATEGORIES, CERT_STATUSES } from "@/packages/shared/constants";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import type { Session } from "@/lib/auth/session";

const searchQuerySchema = z.object({
  district: z.enum(DISTRICTS).optional(),
  category: z.enum(INSTRUMENT_CATEGORIES).optional(),
  status: z.enum(CERT_STATUSES).optional(),
});

const TAKE = 25; // per kind; demo scale — keep responses bounded
// AUDIT FINDING #31: the instrument status filter is derived in memory, so the
// candidate window must be larger than the response bound — otherwise a status
// filter could return visibly incomplete results. 200 candidates keeps this
// correct for realistic backlogs; documented here per the audit recommendation.
const INSTRUMENT_CANDIDATES = 200;

export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session); // any authenticated role; scoping below
  if (guard) return guard;
  const s = session as Session;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  // NEGATIVE test contract: missing/empty -> VALIDATION_ERROR, >64 chars -> VALIDATION_ERROR
  if (q.length < 1 || q.length > 64) {
    return jsonErr("VALIDATION_ERROR", "Query param ?q= must be 1..64 characters");
  }
  const parsed = searchQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid filter", parsed.error.flatten());
  }
  const { district, category, status } = parsed.data;

  // RBAC scoping: TRADER -> own instruments/certs only; LMO/GATC -> own
  // district; ADMIN -> all. (Same shape as MA2's GET /instruments scoping.)
  const instrumentScope: Prisma.InstrumentWhereInput =
    s.role === "TRADER"
      ? { ownerId: s.userId }
      : s.role === "ADMIN"
        ? {}
        : { district: s.district ?? "__none__" };

  const contains = { contains: q, mode: "insensitive" as const };

  const [instruments, certs] = await Promise.all([
    db.instrument.findMany({
      where: {
        ...instrumentScope,
        ...(district ? { district } : {}),
        ...(category ? { category } : {}),
        OR: [{ serialNumber: contains }, { make: contains }, { model: contains }],
      },
      orderBy: { createdAt: "desc" },
      take: INSTRUMENT_CANDIDATES,
    }),
    db.certificate.findMany({
      where: {
        ...(s.role === "TRADER"
          ? { instrument: { ownerId: s.userId } }
          : s.role === "ADMIN"
            ? {}
            : { instrument: { district: s.district ?? "__none__" } }),
        ...(district ? { instrument: { district } } : {}),
        ...(category ? { instrument: { category } } : {}),
        ...(status ? { status } : {}),
        certId: contains,
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        certId: true,
        status: true,
        instrument: { select: { serialNumber: true, category: true, district: true } },
      },
    }),
  ]);

  // derive instrument status from the LATEST certificate — one batched query,
  // no N+1 (statuses come back newest-first, so first-seen wins)
  const latest = instruments.length
    ? await db.certificate.findMany({
        where: { instrumentId: { in: instruments.map((i: { id: string }) => i.id) } },
        orderBy: { createdAt: "desc" },
        select: { instrumentId: true, status: true },
      })
    : [];
  const latestByInstrument = new Map<string, string>();
  for (const c of latest) {
    if (!latestByInstrument.has(c.instrumentId)) latestByInstrument.set(c.instrumentId, c.status);
  }

  const items: {
    kind: "instrument" | "certificate";
    id: string;
    title: string;
    subtitle: string;
    district: string;
    status: string;
    url: string;
  }[] = [];

  // AUDIT FINDING #30: instrument URLs are role-aware. Only TRADERs have an
  // instrument detail page — officers/admins would be bounced by the middleware
  // if they were handed /trader/... links, so they get their portal root.
  const instrumentUrl =
    s.role === "TRADER"
      ? (id: string) => `/trader/instruments/${id}`
      : s.role === "ADMIN"
        ? () => "/admin/dashboard"
        : () => "/officer";

  for (const i of instruments) {
    const st = latestByInstrument.get(i.id) ?? "UNCERTIFIED";
    // status filter applies to derived instrument status too; instruments with
    // no certificate have none of the CERT_STATUSES and are filtered out
    if (status && st !== status) continue;
    items.push({
      kind: "instrument",
      id: i.id,
      title: i.serialNumber,
      subtitle: `${i.make} ${i.model} · ${i.category}`,
      district: i.district,
      status: st,
      url: instrumentUrl(i.id),
    });
  }
  for (const c of certs) {
    items.push({
      kind: "certificate",
      id: c.certId,
      title: c.certId,
      subtitle: `${c.instrument.serialNumber} · ${c.instrument.category}`,
      district: c.instrument.district,
      status: c.status,
      url: `/verify/${c.certId}`, // public page — valid for every role
    });
  }

  // bound the derived-status-filtered instruments to the response contract
  const bounded = items.slice(0, TAKE + TAKE);
  return jsonOk(bounded);
}
