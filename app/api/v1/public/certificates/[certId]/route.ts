// GET /api/v1/public/certificates/[certId]
// Smarpit (M7). Public consumer-trust badge (PRD #16). NO auth.
//
// Badge contract (comment kept here so Kush's renderer agrees with the API):
//   verdict        = status/date based, priority REVOKED > EXPIRED > EXPIRING_SOON > VALID
//                    * REVOKED || SUSPENDED            -> "REVOKED"
//                    * status==EXPIRED || validUntil<=now -> "EXPIRED"
//                    * validWithin 30 days             -> "EXPIRING_SOON"
//                    * else                               -> "VALID"
//   signatureValid = INDEPENDENT Ed25519 signature result over payloadJws
//                    (WebCrypto verify against /.well-known public key).
//   UI RULE: signatureValid === false => render red "CHECK FAILED — POSSIBLE FAKE",
//            regardless of verdict. So the verifier MUST NOT pre-canonicalize and
//            MUST report the real verify result — see lib/crypto/jws.ts verifyCredential
//            (verifies the 3 segments exactly as received, never re-canonicalizes).
//   anchors      = EXACTLY 5 {label,value}: Instrument Serial / Owner /
//                    Issued By (name + LMO|GATC) / Valid Until (ISO) / Category.
//                    These decode from the signed claims; if the signature is bad the
//                    consumer-trust renderer still surfaces them as-is (verdict + red).
//   validUntil   = ISO date (string). Category = instrument category.
//   history      = last <=5 AuditLog rows for this certId as {at, what}.
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { buildBadge } from "@/lib/public/badge";
import type { CertForBadge } from "@/lib/public/badge";

export async function GET(_req: Request, { params }: { params: { certId: string } }) {
  const cert = await db.certificate.findFirst({
    where: { OR: [{ certId: params.certId }, { id: params.certId }] },
    select: {
      id: true,
      certId: true,
      status: true,
      validUntil: true,
      issuedByKind: true,
      payloadJws: true,
      instrument: { select: { serialNumber: true, category: true, owner: { select: { name: true } } } },
    },
  });
  if (!cert) return jsonErr("NOT_FOUND", `No certificate matching '${params.certId}'`);

  return jsonOk(await buildBadge(cert as unknown as CertForBadge));
}