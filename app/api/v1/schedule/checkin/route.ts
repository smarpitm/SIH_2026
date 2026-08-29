import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { applyTransition } from "@/lib/auth/transition";
import { audit } from "@/lib/auth/audit";

const bodySchema = z.object({ scheduleId: z.string().min(1) });

// book MA3 item 4 — POST /schedule/checkin
const CHECKIN_WINDOW_MS = 2 * 60 * 60 * 1000; // -2h
const CHECKIN_GRACE_MS = 8 * 60 * 60 * 1000; // +8h

export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "LMO", "GATC");
  if (guard) return guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid check-in payload", parsed.error.flatten());
  }

  const schedule = await db.schedule.findUnique({
    where: { id: parsed.data.scheduleId },
    include: { application: { include: { instrument: { select: { district: true } } } } },
  });
  if (!schedule) return jsonErr("NOT_FOUND", "Schedule not found");

  // jurisdiction gate first — officer from another district on this job gets the
  // exact JURISDICTION_FORBIDDEN shape (book MA3 MANUAL CHECK #5)
  const jurisdiction = assertJurisdiction(session!, schedule.application.instrument.district);
  if (jurisdiction) return jurisdiction;

  if (schedule.assigneeId !== session!.userId) {
    return jsonErr("AUTH_FORBIDDEN", "Not your assigned schedule");
  }

  const now = Date.now();
  const target = schedule.scheduledFor.getTime();
  if (now < target - CHECKIN_WINDOW_MS || now > target + CHECKIN_GRACE_MS) {
    return jsonErr("VALIDATION_ERROR", "outside check-in window");
  }

  const transition = await applyTransition(schedule.application, "CHECKED_IN");
  if (transition instanceof Response) return transition;

  await db.schedule.update({ where: { id: schedule.id }, data: { status: "DONE" } });
  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "schedule.checkin",
    entity: "schedule",
    entityId: schedule.id,
    meta: { applicationId: schedule.applicationId },
  });

  return jsonOk({ status: "CHECKED_IN", scheduleId: schedule.id });
}