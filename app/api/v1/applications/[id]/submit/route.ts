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

  // AUDIT FINDING #12/#7: pick the officer BEFORE any write — if no officer
  // exists in the district, the application stays untouched (no partial
  // SUBMITTED state) and the caller can retry later.
  const officer = await pickAllocationOfficer(application.instrument.district);
  if (!officer) {
    return jsonErr("INTERNAL", "no officer in district");
  }

  const scheduledFor = application.preferredDate ?? new Date(Date.now() + 7 * 86400000);

  // AUDIT FINDING #12: the entire submit+allocation workflow is ONE transaction
  // — DRAFT->SUBMITTED, declaration, schedule creation, SUBMITTED->SCHEDULED and
  // the audit row commit or roll back together.
  type TransitionFailure = { response: Response };
  try {
    await db.$transaction(async (tx) => {
      // DRAFT -> SUBMITTED (second submit hits applyTransition(SUBMITTED -> SUBMITTED),
      // → INVALID_STATE_TRANSITION { details: { from, to } } EXACT shape)
      const res = await applyTransition(application, "SUBMITTED", tx);
      if (res instanceof Response) throw { response: res } as TransitionFailure;

      await tx.application.update({
        where: { id: application.id },
        data: { declarationAccepted: true },
      });

      // book MA3 item 1: auto-allocation with the officer picked above
      const schedule = await tx.schedule.create({
        data: {
          applicationId: application.id,
          assigneeId: officer.id,
          assigneeKind: officer.role,
          scheduledFor,
        },
      });

      // SUBMITTED -> SCHEDULED via the same transition helper
      const scheduledRes = await applyTransition({ id: application.id, status: "SUBMITTED" }, "SCHEDULED", tx);
      if (scheduledRes instanceof Response) throw { response: scheduledRes } as TransitionFailure;

      await audit(
        {
          actorId: session!.userId,
          actorKind: session!.role,
          action: "application.allocated",
          entity: "application",
          entityId: application.id,
          meta: { assigneeId: officer.id, assigneeKind: officer.role, scheduleId: schedule.id, scheduledFor: scheduledFor.toISOString() },
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

  return jsonOk({ status: "SCHEDULED" });
}