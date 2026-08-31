// GET /api/v1/public/certificates/lookup?q=<certId|serial>
// Smarpit (M7). PRD: typed-ID fallback (not only QR) — matches certId OR instrument
// serial number. NO auth. In-memory rate limit 30 req/min/IP -> RATE_LIMITED (429).
//   * found   -> same BadgeDTO shape as /public/certificates/[certId]
//   * not found -> 200 { data: { found:false } } (public page shows amber; NOT a 404)
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { buildBadge, clientIp, consumeLookup } from "@/lib/public/badge";
import type { CertForBadge } from "@/lib/public/badge";

export async function GET(req: Request) {
  const ip = clientIp(req);
  if (!consumeLookup(ip)) {
    return jsonErr("RATE_LIMITED", "Too many lookups, try again in a minute", { ip });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return jsonErr("VALIDATION_ERROR", "Query param ?q= (certId or serial) required");

  const cert = await db.certificate.findFirst({
    where: { OR: [{ certId: q }, { instrument: { serialNumber: q } }] },
    select: {
      id: true,
      certId: true,
      status: true,
      validUntil: true,
      issuedByKind: true,
      payloadJws: true, // MANDATORY — buildBadge verifies it; omitting this would
      // falsify signatureValid:false for every lookup (red CHECK FAILED on good certs)
      instrument: { select: { serialNumber: true, category: true, owner: { select: { name: true } } } },
    },
  });
  if (!cert) return jsonOk({ found: false });

  const badge = await buildBadge(cert as unknown as CertForBadge);
  return jsonOk(badge);
}
