import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { applyTransition } from "@/lib/auth/transition";
import { audit } from "@/lib/auth/audit";

const bodySchema = z.object({ scheduleId: z.string().min(1) });

// book MA3 item 4 — POST /schedule/checkin
// Check-in is allowed at ANY time relative to scheduledFor — before, on, or
// long after the scheduled date. The trader picks a DATE only (no time slot),
// so the old fixed window around the stored timestamp (a UTC-midnight pick
// anchored at 05:30 IST windowed to 03:30–13:30) locked out every overdue job
// and every early-morning/late-day arrival. The officer records arrival when
// they are actually on site; the scheduled date is a target, not a hard gate.

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

  // AUDIT FINDINGS #76 + #109: the state transition and the audit row commit
  // atomically (a crash mid-write can no longer strand a half-checked-in
  // schedule), and check-in NO LONGER marks the schedule DONE — arrival on
  // site is not a completed inspection. The schedule only becomes DONE when
  // the inspection report is submitted (app/api/v1/inspections/route.ts), so
  // the job stays visible in the officer's active queue until then.
  type TransitionFailure = { response: Response };
  try {
    await db.$transaction(async (tx) => {
      const transition = await applyTransition(schedule.application, "CHECKED_IN", tx);
      if (transition instanceof Response) throw { response: transition } as TransitionFailure;
      await audit(
        {
          actorId: session!.userId,
          actorKind: session!.role,
          action: "schedule.checkin",
          entity: "schedule",
          entityId: schedule.id,
          meta: { applicationId: schedule.applicationId },
        },
        tx
      );
    });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "response" in e &&
      (e as TransitionFailure).response instanceof Response
    ) {
      return (e as TransitionFailure).response;
    }
    throw e;
  }

  return jsonOk({ status: "CHECKED_IN", scheduleId: schedule.id });
}
