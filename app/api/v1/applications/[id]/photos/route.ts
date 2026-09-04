import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import {
  storeUploads,
  filesFromForm,
  UnsupportedMediaTypeError,
  requestBodyTooLarge,
  requestLimitMessage,
  DEFAULT_REQUEST_LIMIT_BYTES,
  PHOTO_POLICY,
} from "@/lib/uploads/multipart";

// book MA2 item 9 — POST /applications/[id]/photos
// Access: TRADER owner or assigned officer (Schedule.assigneeId — schedules exist from MA3).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const application = await db.application.findUnique({
    where: { id: params.id },
    include: { instrument: { select: { ownerId: true } } },
  });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");

  let allowed = false;
  if (session!.role === "TRADER") {
    allowed = application.instrument.ownerId === session!.userId;
  } else if (session!.role === "LMO" || session!.role === "GATC") {
    const assigned = await db.schedule.findFirst({
      where: { applicationId: application.id, assigneeId: session!.userId },
    });
    allowed = assigned !== null;
  }
  if (!allowed) return jsonErr("AUTH_FORBIDDEN", "Not your application");

  // AUDIT FINDING #16: hard request cap BEFORE formData() buffers the body
  if (requestBodyTooLarge(req)) {
    return jsonErr("VALIDATION_ERROR", requestLimitMessage(DEFAULT_REQUEST_LIMIT_BYTES));
  }
  const form = await req.formData().catch(() => null);
  if (!form) return jsonErr("VALIDATION_ERROR", "multipart/form-data body required");
  const photos = filesFromForm(form, "photos");
  if (photos.length === 0) {
    return jsonErr("VALIDATION_ERROR", "photos[] with at least one file is required");
  }

  try {
    // PHOTO_POLICY: image MIME types only (audit finding #16 — a photo route
    // must never accept PDFs)
    const stored = await storeUploads(photos, `applications/${application.id}/photos`, PHOTO_POLICY);
    const keys = stored.map((s) => s.key);
    await audit({
      actorId: session!.userId,
      actorKind: session!.role,
      action: "application.photos_added",
      entity: "application",
      entityId: application.id,
      meta: { keys },
    });
    return jsonOk({ keys });
  } catch (e) {
    if (e instanceof UnsupportedMediaTypeError) {
      return jsonErr("UNSUPPORTED_MEDIA_TYPE", e.reason, { reason: e.reason });
    }
    throw e;
  }
}
