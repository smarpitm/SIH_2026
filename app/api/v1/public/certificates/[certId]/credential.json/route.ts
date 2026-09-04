// GET /api/v1/public/certificates/[certId]/credential.json
// Smarpit (M7). OpenCerts-style machine-readable credential artifact (PRD
// differentiator). NO auth — the artifact exists so EXTERNAL verifiers can
// check it themselves; rate-limited like /lookup (shares the lookup bucket:
// same abuse model, same 30 req/min/IP).
//
// Contract: { jws, jwk, kid, fetchedAt }
//   jws       = RAW compact JWS, byte-for-byte as issued — NEVER modified
//   jwk       = current Ed25519 public key (OKP/Ed25519)
//   kid       = key id ("pramanam-2026-08-01")
//   fetchedAt = ISO timestamp of this fetch
// The CONSUMER verifies the signature with jws+jwk — same honest trust model
// as the badge (we never pre-verify on their behalf, never re-canonicalize).
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/security/ratelimit";
import { KID, publicKeyJwk } from "@/lib/crypto/keys";

export async function GET(req: Request, { params }: { params: { certId: string } }) {
  const ip = clientIp(req);
  const limit = await rateLimit(`credential:${ip}`, 30, 60);
  if (!limit.allowed) {
    return jsonErr("RATE_LIMITED", "Too many fetches, try again in a minute");
  }
  // AUDIT FINDING #47: public certId only — reject internal cuid-shaped ids.
  if (/^c[a-z0-9]{24}$/i.test(params.certId)) {
    return jsonErr("NOT_FOUND", `No certificate matching '${params.certId}'`);
  }

  const cert = await db.certificate.findUnique({
    where: { certId: params.certId },
    select: { payloadJws: true }, // RAW compact JWS — returned unmodified below
  });
  if (!cert) {
    return jsonErr("NOT_FOUND", `No certificate matching '${params.certId}'`);
  }

  return jsonOk({
    jws: cert.payloadJws,
    jwk: publicKeyJwk(),
    kid: KID,
    fetchedAt: new Date().toISOString(),
  });
}
