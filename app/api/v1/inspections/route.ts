import { Prisma } from "@prisma/client";
import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { applyTransition } from "@/lib/auth/transition";
import { audit } from "@/lib/auth/audit";
import { emitInspectionPass } from "@/lib/hooks";
import { OBSERVATION_CONFIG } from "@/packages/shared/constants";
import { storeUploads, filesFromForm, UnsupportedMediaTypeError } from "@/lib/uploads/multipart";
import { registerWorkers } from "@/workers/index";

// DEMO-SWEEP FIX (branch kush): Next.js compiles instrumentation.ts as its OWN
// server bundle, so the pass handler it registers lives in a different lib/hooks
// module instance than the one bundled with THIS route — inspection PASS ran with
// ZERO handlers and silently issued no certificate (found by tests/smoke.spec.ts).
// registerWorkers() is idempotent and startExpiryQueue() is globalThis-cached, so
// calling it here (same bundle as emitInspectionPass) is the minimal safe wiring.
// Deviation from the "routes never import workers directly" note — announced in
// context.txt §7 for Smarpit/Manav.
registerWorkers();

// book MA3 item 6 — POST /inspections (assigned officer; app must be CHECKED_IN)
const DEFAULT_KEYS = OBSERVATION_CONFIG.default.map((o) => o.key);

const resultSchema = z.enum(["PASS", "FAIL"]);

export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "LMO", "GATC");
  if (guard) return guard;

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

  // observations JSON — validate keys against OBSERVATION_CONFIG.default
  let observations: unknown = null;
  try {
    observations = observationsRaw ? JSON.parse(String(observationsRaw)) : null;
  } catch {
    return jsonErr("VALIDATION_ERROR", "observations must be valid JSON");
  }
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) {
    return jsonErr("VALIDATION_ERROR", "observations must be an object");
  }
  const obsKeys = Object.keys(observations);
  for (const k of obsKeys) {
    if (!DEFAULT_KEYS.includes(k)) {
      return jsonErr("VALIDATION_ERROR", `unknown observation key: ${k}`);
    }
  }

  const photos = filesFromForm(form, "photos");
  let photoKeys: string[] = [];
  try {
    const stored = await storeUploads(photos, `inspections/${application.id}`);
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

  const report = await db.inspectionReport.create({
    data: {
      applicationId: application.id,
      inspectorId: session!.userId,
      result: parsedResult.data,
      observations: observations as Prisma.InputJsonValue,
      photoKeys: photoKeys as Prisma.InputJsonValue,
      ...(gpsLat !== null ? { gpsLat } : {}),
      ...(gpsLng !== null ? { gpsLng } : {}),
      checkedInAt: new Date(),
      ...(parsedResult.data === "FAIL" ? { failReason: String(failReasonRaw) } : {}),
    },
  });

  // PASS → emitInspectionPass (frozen hook, no-op if unregistered) then PASSED
  if (parsedResult.data === "PASS") {
    await emitInspectionPass({
      applicationId: application.id,
      instrumentId: application.instrument.id,
      reportId: report.id,
      inspectorId: session!.userId,
      inspectorKind: session!.role as "LMO" | "GATC",
    });
    const pass = await applyTransition(application, "PASSED");
    if (pass instanceof Response) return pass;
  } else {
    const fail = await applyTransition(application, "FAILED");
    if (fail instanceof Response) return fail;
  }

  await audit({
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
  });

  return jsonOk({ id: report.id, applicationId: application.id, result: parsedResult.data });
}