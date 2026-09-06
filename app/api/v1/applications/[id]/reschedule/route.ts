import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { MAX_RESCHEDULES } from "@/packages/shared/constants";
import { startOfBusinessToday } from "@/lib/time";

const bodySchema = z.object({
  reason: z.string().min(10),
  // AUDIT FINDING #14: a reschedule must carry a REAL new date — validated in
  // the business timezone (today-or-future), applied atomically below.
  newDate: z
    .string()
    .datetime()
    .refine((v) => new Date(v).getTime() >= startOfBusinessToday().getTime(), {
      message: "newDate must be today or a future date",
    }),
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

  const scheduledFor = new Date(parsed.data.newDate);
  // AUDIT FINDING #113: the MAX_RESCHEDULES budget is enforced ATOMICALLY.
  // updateMany with `rescheduleCount: { lt: MAX_RESCHEDULES }` in the WHERE
  // clause makes read-check+increment a single conditional statement — two
  // concurrent reschedules can never both pass (the loser matches 0 rows).
  type BudgetFailure = { budget: true };
  let newCount = 0;
  try {
    await db.$transaction(async (tx) => {
      const bumped = await tx.schedule.updateMany({
        where: { id: schedule.id, rescheduleCount: { lt: MAX_RESCHEDULES } },
        data: {
          rescheduleCount: { increment: 1 },
          lastReason: parsed.data.reason,
          scheduledFor,
          status: "RESCHEDULED",
        },
      });
      if (bumped.count !== 1) throw { budget: true } as BudgetFailure;
      newCount = schedule.rescheduleCount + 1;
      // keep the trader's preference in sync so downstream re-allocations reuse it
      await tx.application.update({
        where: { id: application.id },
        data: { preferredDate: scheduledFor },
      });
      await audit(
        {
          actorId: session!.userId,
          actorKind: session!.role,
          action: "application.reschedule",
          entity: "application",
          entityId: application.id,
          meta: {
            reason: parsed.data.reason,
            rescheduleCount: newCount,
            scheduledFor: scheduledFor.toISOString(),
          },
        },
        tx
      );
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as BudgetFailure).budget) {
      return jsonErr("RESCHEDULE_BUDGET_EXHAUSTED", "Reschedule budget exhausted");
    }
    throw e;
  }

  return jsonOk({
    status: "SCHEDULED",
    rescheduleCount: newCount,
    scheduledFor: scheduledFor.toISOString(),
  });
}