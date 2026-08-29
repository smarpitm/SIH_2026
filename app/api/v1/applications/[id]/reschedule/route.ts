import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { MAX_RESCHEDULES } from "@/packages/shared/constants";

const bodySchema = z.object({
  reason: z.string().min(10),
});

// book MA3 item 5 — POST /applications/[id]/reschedule (TRADER owner, while SCHEDULED)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;

  const application = await db.application.findUnique({
    where: { id: params.id },
    include: { instrument: { select: { district: true } }, schedules: true },
  });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");
  if (application.traderId !== session!.userId) {
    return jsonErr("AUTH_FORBIDDEN", "Not your application");
  }
  if (application.status !== "SCHEDULED") {
    return jsonErr("INVALID_STATE_TRANSITION", "Application can only be rescheduled while SCHEDULED", {
      from: application.status,
      to: "SCHEDULED",
    });
  }
  const schedule = application.schedules[0];
  if (!schedule) return jsonErr("NOT_FOUND", "Schedule not found");
  if (schedule.rescheduleCount >= MAX_RESCHEDULES) {
    return jsonErr("RESCHEDULE_BUDGET_EXHAUSTED", "Reschedule budget exhausted");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid reschedule payload", parsed.error.flatten());
  }

  const scheduledFor = application.preferredDate ?? new Date(Date.now() + 7 * 86400000);
  await db.schedule.update({
    where: { id: schedule.id },
    data: {
      rescheduleCount: { increment: 1 },
      lastReason: parsed.data.reason,
      scheduledFor,
      status: "RESCHEDULED",
    },
  });

  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "application.reschedule",
    entity: "application",
    entityId: application.id,
    meta: { reason: parsed.data.reason, rescheduleCount: schedule.rescheduleCount + 1, scheduledFor: scheduledFor.toISOString() },
  });

  return jsonOk({
    status: "SCHEDULED",
    rescheduleCount: schedule.rescheduleCount + 1,
    scheduledFor: scheduledFor.toISOString(),
  });
}