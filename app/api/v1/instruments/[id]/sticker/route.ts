import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { renderSticker } from "@/lib/pdf/certificate";
import { putVersionedPdf, getPresignedGetUrl } from "@/lib/pdf/store";

// GET /api/v1/instruments/[id]/sticker — A6 sticker for the instrument's
// ACTIVE certificate (big variant-A offline QR). Role-scoped: owner trader /
// same-district LMO / ADMIN. NEGATIVE: no ACTIVE certificate -> NOT_FOUND.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER", "LMO", "GATC", "ADMIN");
  if (guard) return guard;

  const instrument = await db.instrument.findUnique({
    where: { id: params.id },
    include: {
      certificates: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!instrument) return jsonErr("NOT_FOUND", "Instrument not found");

  const s = session!;
  const isOwner = s.role === "TRADER" && instrument.ownerId === s.userId;
  const isDistrictLmo = (s.role === "LMO" || s.role === "GATC") && s.district === instrument.district;
  const isAdmin = s.role === "ADMIN";
  if (!isOwner && !isDistrictLmo && !isAdmin) {
    return jsonErr("AUTH_FORBIDDEN", "Not permitted to download this sticker");
  }

  const cert = instrument.certificates[0];
  if (!cert) {
    return jsonErr("NOT_FOUND", "No ACTIVE certificate for this instrument — sticker not available");
  }

  // sticker is stateless to render (pure function of the cert); store versioned
  // under certs/<certId>/ for traceability alongside the sheet.
  const bytes = await renderSticker({
    certId: cert.certId,
    serialNumber: instrument.serialNumber,
    category: instrument.category,
    validUntil: cert.validUntil,
    qrPayload: cert.qrPayload,
  });
  const key = await putVersionedPdf(cert.certId, bytes, { status: `STICKER:${cert.status}` });

  await db.auditLog.create({
    data: {
      actorId: s.userId,
      actorKind: s.role,
      action: "cert.sticker_downloaded",
      entity: "instrument",
      entityId: instrument.id,
      meta: { certId: cert.certId, key },
    },
  });

  return jsonOk({ url: await getPresignedGetUrl(key, 300) });
}