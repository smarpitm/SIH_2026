import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { renderCertificateSheet } from "@/lib/pdf/certificate";
import { putVersionedPdf, getPresignedGetUrl, headPdfStatus } from "@/lib/pdf/store";

// GET /api/v1/certificates/[id]/pdf — role-scoped like the certificate route.
// Regenerates when pdfKey is missing OR the object metadata says the sheet was
// rendered under a different status. Responds { url } (presigned, 300s).
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
    return jsonErr("AUTH_FORBIDDEN", "Not permitted to download this certificate PDF");
  }

  // regenerate when missing or stale (status changed since last render)
  let pdfKey = cert.pdfKey;
  if (pdfKey) {
    const renderedStatus = await headPdfStatus(pdfKey);
    if (renderedStatus !== cert.status) pdfKey = null;
  }
  if (!pdfKey) {
    try {
      const bytes = await renderCertificateSheet({
        certId: cert.certId,
        status: cert.status,
        validFrom: cert.validFrom,
        validUntil: cert.validUntil,
        payloadJws: cert.payloadJws,
        qrPayload: cert.qrPayload,
      });
      pdfKey = await putVersionedPdf(cert.certId, bytes, { status: cert.status });
      await db.certificate.update({ where: { id: cert.id }, data: { pdfKey } });
    } catch (e) {
      console.error("[cert.pdf] render/upload failed:", e);
      return jsonErr("INTERNAL", "Failed to render certificate PDF");
    }
  }

  await db.auditLog.create({
    data: {
      actorId: s.userId,
      actorKind: s.role,
      action: "cert.pdf_downloaded",
      entity: "certificate",
      entityId: cert.id,
      meta: { certId: cert.certId, pdfKey },
    },
  });

  return jsonOk({ url: await getPresignedGetUrl(pdfKey, 300) });
}