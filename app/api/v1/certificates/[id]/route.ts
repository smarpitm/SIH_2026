import { jsonOk, jsonErr } from "@/packages/shared/api";
import type { CertificateDTO } from "@/packages/shared/types";
import type { CertStatus } from "@/packages/shared/constants";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";

// GET /api/v1/certificates/[id] - role-scoped: owner trader / issuing officer /
// same-district LMO / ADMIN. Returns CertificateDTO incl. payloadJws + qrPayload.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER", "LMO", "GATC", "ADMIN");
  if (guard) return guard;

  const cert = await db.certificate.findFirst({
    where: { OR: [{ certId: params.id }, { id: params.id }] },
    include: {
      instrument: { select: { serialNumber: true, category: true, district: true, ownerId: true } },
    },
  });
  if (!cert) return jsonErr("NOT_FOUND", "Certificate not found");

  const s = session!;
  const isOwner = s.role === "TRADER" && cert.instrument.ownerId === s.userId;
  const isIssuer = cert.issuedById === s.userId;
  const isDistrictLmo = s.role === "LMO" && s.district === cert.instrument.district;
  const isAdmin = s.role === "ADMIN";
  if (!isOwner && !isIssuer && !isDistrictLmo && !isAdmin) {
    return jsonErr("AUTH_FORBIDDEN", "Not permitted to view this certificate");
  }

  // owner/issuer display names come from the JWS claims (single source of truth)
  let ownerName = "";
  let issuedBy = "";
  try {
    const claims = JSON.parse(
      Buffer.from(cert.payloadJws.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    ownerName = claims.ownerName ?? "";
    issuedBy = claims.issuedBy ?? "";
  } catch {
    // leave display fields empty rather than failing the fetch
  }

  const dto: CertificateDTO & {
    payloadJws: string;
    qrPayload: string;
    instrumentCategory: string;
    ownerName: string;
    issuedBy: string;
    issuedByKind: string;
  } = {
    id: cert.id,
    certId: cert.certId,
    status: cert.status as CertStatus,
    validFrom: cert.validFrom.toISOString(),
    validUntil: cert.validUntil.toISOString(),
    instrumentSerial: cert.instrument.serialNumber,
    payloadJws: cert.payloadJws,
    qrPayload: cert.qrPayload,
    instrumentCategory: cert.instrument.category,
    ownerName,
    issuedBy,
    issuedByKind: cert.issuedByKind,
  };

  return jsonOk(dto);
}
