import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { renderSticker } from "@/lib/pdf/certificate";
import { putStickerPdf, latestStickerKey, headPdfStatus, getPresignedGetUrl } from "@/lib/pdf/store";

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

  // AUDIT FINDING #73: the sticker is a pure function of the cert (status,
  // anchors and qrPayload are immutable once issued) — REUSE the stored sticker
  // when one already exists for this certId with the same status instead of
  // re-rendering and writing a brand-new S3 object on every read (storage leak).
  // A status change (ACTIVE -> EXPIRING_SOON) triggers exactly one re-render.
  const cachedKey = await latestStickerKey(cert.certId);
  let key: string;
  if (cachedKey && (await headPdfStatus(cachedKey)) === `STICKER:${cert.status}`) {
    key = cachedKey;
  } else {
    const bytes = await renderSticker({
      certId: cert.certId,
      serialNumber: instrument.serialNumber,
      category: instrument.category,
      validUntil: cert.validUntil,
      qrPayload: cert.qrPayload,
    });
    key = await putStickerPdf(cert.certId, bytes, { status: `STICKER:${cert.status}` });
  }

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