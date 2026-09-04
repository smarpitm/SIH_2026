// GET /api/v1/public/certificates/lookup?q=<certId|serial>&district=<district?>
// Smarpit (M7). PRD: typed-ID fallback (not only QR) — matches certId OR instrument
// serial number. NO auth. Durable rate limit 30 req/min/IP (Redis-backed;
// audit finding #7) -> RATE_LIMITED (429).
//   * found -> same BadgeDTO shape as /public/certificates/[certId]
//   * serial ambiguous across districts -> 200 { data: { found:false, ambiguous:true,
//     candidates:[{certId,district}] } } (audit finding #22 — never an arbitrary pick)
//   * not found -> 200 { data: { found:false } } (public page shows amber; NOT a 404)
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { buildBadge } from "@/lib/public/badge";
import type { CertForBadge } from "@/lib/public/badge";
import { rateLimit, clientIp } from "@/lib/security/ratelimit";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return jsonErr("VALIDATION_ERROR", "Query param ?q= (certId or serial) required");

  const ip = clientIp(req);
  // two buckets: per-IP overall, and per-IP+query so a single high-value query
  // cannot be hammered from one address either (audit finding #7)
  const overall = await rateLimit(`lookup:${ip}`, 30, 60);
  const perQuery = await rateLimit(`lookup:q:${ip}:${q}`, 30, 60);
  if (!overall.allowed || !perQuery.allowed) {
    return jsonErr("RATE_LIMITED", "Too many lookups, try again in a minute", { ip });
  }

  // AUDIT FINDING #22: serial numbers are unique only per district. Fetch all
  // matches; a single match resolves normally, multiple matches return
  // non-sensitive disambiguation candidates instead of an arbitrary findFirst.
  const matches = await db.certificate.findMany({
    where: { OR: [{ certId: q }, { instrument: { serialNumber: q } }] },
    select: {
      id: true,
      certId: true,
      status: true,
      validUntil: true,
      issuedByKind: true,
      payloadJws: true, // MANDATORY — buildBadge verifies it; omitting this would
      // falsify signatureValid:false for every lookup (red CHECK FAILED on good certs)
      instrument: {
        select: {
          serialNumber: true,
          district: true,
          category: true,
          owner: { select: { name: true } },
        },
      },
    },
    take: 5,
  });
  if (matches.length === 0) return jsonOk({ found: false });
  if (matches.length > 1) {
    return jsonOk({
      found: false,
      ambiguous: true,
      candidates: matches.map((m) => ({ certId: m.certId, district: m.instrument.district })),
    });
  }

  const badge = await buildBadge(matches[0] as unknown as CertForBadge);
  return jsonOk(badge);
}
