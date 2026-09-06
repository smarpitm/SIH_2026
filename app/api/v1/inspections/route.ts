import { Prisma } from "@prisma/client";
import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { applyTransition } from "@/lib/auth/transition";
import { audit } from "@/lib/auth/audit";
import { issueCertificate } from "@/lib/crypto/issue";
import { OBSERVATION_CONFIG } from "@/packages/shared/constants";
import {
  storeUploads,
  filesFromForm,
  UnsupportedMediaTypeError,
  requestBodyTooLarge,
  requestLimitMessage,
  DEFAULT_REQUEST_LIMIT_BYTES,
  PHOTO_POLICY,
} from "@/lib/uploads/multipart";

// book MA3 item 6 — POST /inspections (assigned officer; app must be CHECKED_IN)
// AUDIT FINDING #4: the whole PASS/FAIL workflow is now ONE transaction —
// report + state transitions + certificate + audits + notification commit or
// roll back together, so no stranded PASSED / half-issued state is possible.
// Certificate issuance is inline (same tx), not a detached worker poll.

// Build the Zod schema FROM OBSERVATION_CONFIG (audit finding #18): required
// keys, expected value types, unknown keys rejected.
const observationsSchema = (() => {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const o of OBSERVATION_CONFIG.default) {
    shape[o.key] =
      o.type === "boolean" ? z.boolean() : o.type === "number" ? z.number() : z.string().min(1);
  }
  return z.object(shape).strict();
})();

const resultSchema = z.enum(["PASS", "FAIL"]);

export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "LMO", "GATC");
  if (guard) return guard;

  // AUDIT FINDING #16: hard request cap BEFORE formData() buffers the body
  if (requestBodyTooLarge(req)) {
    return jsonErr("VALIDATION_ERROR", requestLimitMessage(DEFAULT_REQUEST_LIMIT_BYTES));
  }
  const form = await req.formData().catch(() => null);
  if (!form) return jsonErr("VALIDATION_ERROR", "multipart/form-data body required");

  const scheduleId = form.get("scheduleId");
  const result = form.get("result");
  const observationsRaw = form.get("observations");
  const gpsLatRaw = form.get("gpsLat");
  const gpsLngRaw = form.get("gpsLng");
  const failReasonRaw = form.get("failReason");

  const schedule = scheduleId ? await db.schedule.findUnique({ where: { id: String(scheduleId) } }) : null;
  if (!schedule) return jsonErr("NOT_FOUND", "Schedule not found");

  const application = await db.application.findUnique({
    where: { id: schedule.applicationId },
    include: { instrument: { select: { id: true, district: true } } },
  });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");

  // jurisdiction gate first — officer from another district gets the exact
  // JURISDICTION_FORBIDDEN shape (book MA3 MANUAL CHECK #5)
  const jurisdiction = assertJurisdiction(session!, application.instrument.district);
  if (jurisdiction) return jurisdiction;

  if (schedule.assigneeId !== session!.userId) {
    return jsonErr("AUTH_FORBIDDEN", "Not your assigned schedule");
  }

  if (application.status !== "CHECKED_IN") {
    return jsonErr("VALIDATION_ERROR", "Application must be CHECKED_IN before inspection");
  }

  const parsedResult = resultSchema.safeParse(result);
  if (!parsedResult.success) {
    return jsonErr("VALIDATION_ERROR", "result must be PASS or FAIL");
  }
  if (parsedResult.data === "FAIL" && (!failReasonRaw || String(failReasonRaw).trim().length === 0)) {
    return jsonErr("VALIDATION_ERROR", "failReason is required when result is FAIL");
  }

  // observations JSON — full schema validation from OBSERVATION_CONFIG
  // (audit finding #18): required keys present, value types enforced,
  // unknown keys rejected.
  let observations: unknown = null;
  try {
    observations = observationsRaw ? JSON.parse(String(observationsRaw)) : null;
  } catch {
    return jsonErr("VALIDATION_ERROR", "observations must be valid JSON");
  }
  const obsParsed = observationsSchema.safeParse(observations);
  if (!obsParsed.success) {
    return jsonErr("VALIDATION_ERROR", "observations do not match OBSERVATION_CONFIG", {
      issues: obsParsed.error.issues,
    });
  }

  // AUDIT FINDING #17: photos are mandatory evidence — at least one image.
  // PHOTO_POLICY also restricts this field to image MIME types only (finding #16).
  const photos = filesFromForm(form, "photos");
  if (photos.length === 0) {
    return jsonErr("VALIDATION_ERROR", "at least one inspection photo is required");
  }
  let photoKeys: string[] = [];
  try {
    const stored = await storeUploads(photos, `inspections/${application.id}`, PHOTO_POLICY);
    photoKeys = stored.map((s) => s.key);
  } catch (e) {
    if (e instanceof UnsupportedMediaTypeError) {
      return jsonErr("UNSUPPORTED_MEDIA_TYPE", e.reason, { reason: e.reason });
    }
    throw e;
  }

  const gpsLat = gpsLatRaw !== null ? Number(gpsLatRaw) : null;
  const gpsLng = gpsLngRaw !== null ? Number(gpsLngRaw) : null;
  if ((gpsLat !== null && Number.isNaN(gpsLat)) || (gpsLng !== null && Number.isNaN(gpsLng))) {
    return jsonErr("VALIDATION_ERROR", "gpsLat/gpsLng must be numbers");
  }

  type TransitionFailure = { response: Response };
  let reportId: string;
  try {
    const result = await db.$transaction(async (tx) => {
      const report = await tx.inspectionReport.create({
        data: {
          applicationId: application.id,
          inspectorId: session!.userId,
          result: parsedResult.data,
          observations: obsParsed.data as Prisma.InputJsonValue,
          photoKeys: photoKeys as Prisma.InputJsonValue,
          ...(gpsLat !== null ? { gpsLat } : {}),
          ...(gpsLng !== null ? { gpsLng } : {}),
          checkedInAt: new Date(),
          ...(parsedResult.data === "FAIL" ? { failReason: String(failReasonRaw) } : {}),
        },
      });

      if (parsedResult.data === "PASS") {
        // CHECKED_IN -> PASSED inside the same tx as the report
        const pass = await applyTransition(application, "PASSED", tx);
        if (pass instanceof Response) throw { response: pass } as TransitionFailure;

        // Inline, transactional issuance (audit finding #4): certificate +
        // cert.issued audit + owner notification join THIS transaction. If
        // issuance fails, everything rolls back (app stays CHECKED_IN) and the
        // officer can retry — no stranded PASSED, no silent failure.
        const cert = await issueCertificate(
          {
            applicationId: application.id,
            instrumentId: application.instrument.id,
            reportId: report.id,
            inspectorId: session!.userId,
            inspectorKind: session!.role as "LMO" | "GATC",
          },
          tx
        );
        if (!cert) throw new Error("certificate issuance failed");

        // complete the lifecycle PASSED -> CERT_ISSUED atomically
        const issued = await applyTransition(pass.app, "CERT_ISSUED", tx);
        if (issued instanceof Response) throw { response: issued } as TransitionFailure;
        await tx.auditLog.create({
          data: {
            actorId: null,
            actorKind: "system",
            action: "app.cert_issued",
            entity: "application",
            entityId: application.id,
            meta: { certId: cert.certId },
          },
        });
      } else {
        const fail = await applyTransition(application, "FAILED", tx);
        if (fail instanceof Response) throw { response: fail } as TransitionFailure;
      }

      // AUDIT FINDING #109: the schedule is only DONE when the report is
      // actually submitted (check-in no longer closes it) — the job leaves the
      // officer's active queue exactly here, inside the same transaction.
      await tx.schedule.update({
        where: { id: schedule.id },
        data: { status: "DONE" },
      });

      await audit(
        {
          actorId: session!.userId,
          actorKind: session!.role,
          action: parsedResult.data === "PASS" ? "inspection.pass" : "inspection.fail",
          entity: "inspectionReport",
          entityId: report.id,
          meta: {
            applicationId: application.id,
            scheduleId: schedule.id,
            result: parsedResult.data,
            photoKeys,
            ...(gpsLat !== null ? { gpsLat } : {}),
            ...(gpsLng !== null ? { gpsLng } : {}),
            ...(parsedResult.data === "FAIL" ? { failReason: String(failReasonRaw) } : {}),
          },
        },
        tx
      );

      return report;
    });
    reportId = result.id;
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "response" in e &&
      (e as TransitionFailure).response instanceof Response
    ) {
      // a state-machine rejection — surface the exact INVALID_STATE_TRANSITION shape
      return (e as TransitionFailure).response;
    }
    console.error("[inspections] workflow transaction rolled back:", e);
    return jsonErr(
      "INTERNAL",
      "Inspection could not be recorded — all writes rolled back, please retry"
    );
  }

  return jsonOk({ id: reportId, applicationId: application.id, result: parsedResult.data });
}