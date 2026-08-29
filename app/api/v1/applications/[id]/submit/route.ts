import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { applyTransition } from "@/lib/auth/transition";
import { pickAllocationOfficer } from "@/lib/auth/allocation";
import { audit } from "@/lib/auth/audit";

const bodySchema = z.object({
  declarationAccepted: z.boolean(),
});

// book MA3 item 1 — POST /applications/[id]/submit (now also auto-allocates + SCHEDULED)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;

  const application = await db.application.findUnique({
    where: { id: params.id },
    include: { instrument: { select: { id: true, district: true } } },
  });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");
  if (application.traderId !== session!.userId) {
    return jsonErr("AUTH_FORBIDDEN", "Not your application");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !application.feePaidAt || parsed.data.declarationAccepted !== true) {
    return jsonErr("VALIDATION_ERROR", "declaration and payment required");
  }

  // DRAFT -> SUBMITTED (second submit hits applyTransition(SUBMITTED -> SUBMITTED),
  // → INVALID_STATE_TRANSITION { details: { from, to } } EXACT shape)
  const res = await applyTransition(application, "SUBMITTED");
  if (res instanceof Response) return res;

  await db.application.update({
    where: { id: application.id },
    data: { declarationAccepted: true },
  });

  // book MA3 item 1: auto-allocation. Pick officer for the instrument's district.
  const officer = await pickAllocationOfficer(application.instrument.district);
  if (!officer) {
    return jsonErr("INTERNAL", "no officer in district");
  }

  const scheduledFor = application.preferredDate ?? new Date(Date.now() + 7 * 86400000);
  const schedule = await db.schedule.create({
    data: {
      applicationId: application.id,
      assigneeId: officer.id,
      assigneeKind: officer.role,
      scheduledFor,
    },
  });

  // SUBMITTED -> SCHEDULED via the same transition helper
  const scheduledRes = await applyTransition({ id: application.id, status: "SUBMITTED" }, "SCHEDULED");
  if (scheduledRes instanceof Response) return scheduledRes;

  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "application.allocated",
    entity: "application",
    entityId: application.id,
    meta: { assigneeId: officer.id, assigneeKind: officer.role, scheduleId: schedule.id, scheduledFor: scheduledFor.toISOString() },
  });

  return jsonOk({ status: "SCHEDULED" });
}