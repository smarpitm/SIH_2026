import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { applyTransition } from "@/lib/auth/transition";
import { pickAllocationOfficer } from "@/lib/auth/allocation";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { audit } from "@/lib/auth/audit";

const bodySchema = z.object({
  applicationId: z.string(),
});

// book MAV1 — POST /schedule/allocate (ADMIN/LMO/GATC). Replaces the K0 mock
// stub. Deliberately REUSES the exact allocation logic submit auto-allocates
// with (pickAllocationOfficer + preferredDate ?? +7d + the same schedule field
// set) — no new allocation logic here. Doubles as the reassignment path: since
// Schedule.applicationId is UNIQUE, an existing schedule row is updated in
// place (assignee/scheduledFor) — never duplicated.
export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "ADMIN", "LMO", "GATC");
  if (guard) return guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid body", { issues: parsed.error.issues });
  }

  const application = await db.application.findUnique({
    where: { id: parsed.data.applicationId },
    include: {
      instrument: { select: { id: true, district: true, category: true, serialNumber: true } },
    },
  });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");

  const jurisdiction = assertJurisdiction(session!, application.instrument.district);
  if (jurisdiction) return jurisdiction;

  // Only an unallocated (SUBMITTED) or already-allocated (SCHEDULED) app can
  // be (re)allocated — EXACT INVALID_STATE_TRANSITION shape, other streams
  // assert on details { from, to }.
  if (application.status !== "SUBMITTED" && application.status !== "SCHEDULED") {
    return jsonErr("INVALID_STATE_TRANSITION", "Illegal state transition", {
      from: application.status,
      to: "SCHEDULED",
    });
  }

  // Schedule.applicationId is UNIQUE — exactly one schedule row per application.
  const existing = await db.schedule.findUnique({ where: { applicationId: application.id } });

  const officer = await pickAllocationOfficer(
    application.instrument.district,
    // AUDIT FINDING #35: on the reassignment path, exclude the current assignee
    // so a "reallocate" call actually moves the job to a different officer. In a
    // single-officer district there is no alternative — the route then answers
    // INTERNAL "no officer in district" instead of performing a no-op update.
    existing?.assigneeId
  );
  if (!officer) {
    return jsonErr("INTERNAL", "no officer in district");
  }

  const scheduledFor = application.preferredDate ?? new Date(Date.now() + 7 * 86400000);
  let schedule;
  let action: string;
  if (existing) {
    // REASSIGN: update the row in place (no duplicate) — reschedule path.
    schedule = await db.schedule.update({
      where: { id: existing.id },
      data: { assigneeId: officer.id, assigneeKind: officer.role, scheduledFor },
    });
    action = "schedule.reassigned";
  } else {
    // SUBMITTED -> SCHEDULED via the same transition helper submit uses.
    // A SCHEDULED app here (schedule row missing — data-repair case) needs no
    // move: SCHEDULED->SCHEDULED is not a legal transition and must not 409.
    if (application.status === "SUBMITTED") {
      const res = await applyTransition(
        { id: application.id, status: application.status },
        "SCHEDULED"
      );
      if (res instanceof Response) return res;
    }
    schedule = await db.schedule.create({
      data: {
        applicationId: application.id,
        assigneeId: officer.id,
        assigneeKind: officer.role,
        scheduledFor,
      },
    });
    action = "schedule.allocated";
  }

  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action,
    entity: "schedule",
    entityId: schedule.id,
    meta: {
      applicationId: application.id,
      assigneeId: officer.id,
      assigneeKind: officer.role,
      scheduledFor: scheduledFor.toISOString(),
    },
  });

  const trader = await db.user.findUnique({
    where: { id: application.traderId },
    select: { name: true, orgName: true },
  });

  // SAME schedule DTO shape /schedule/mine returns (single item).
  return jsonOk({
    id: schedule.id,
    applicationId: schedule.applicationId,
    assigneeName: officer.name,
    assigneeKind: schedule.assigneeKind as "LMO" | "GATC",
    scheduledFor: schedule.scheduledFor.toISOString(),
    rescheduleCount: schedule.rescheduleCount,
    status: schedule.status,
    overdue: schedule.status === "ASSIGNED" && schedule.scheduledFor.getTime() < Date.now(),
    instrumentCategory: application.instrument.category,
    instrumentSerial: application.instrument.serialNumber,
    traderName: trader?.name ?? null,
    traderOrg: trader?.orgName ?? null,
  });
}