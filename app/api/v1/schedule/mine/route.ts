import { jsonOk } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";

// book MA3 item 3 — GET /schedule/mine (LMO/GATC only)
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "LMO", "GATC");
  if (guard) return guard;

  const schedules = await db.schedule.findMany({
    where: { assigneeId: session!.userId },
    orderBy: { scheduledFor: "asc" },
    include: {
      application: {
        include: {
          instrument: { select: { category: true, serialNumber: true } },
        },
      },
    },
  });

  // trader name from the application's trader (User)
  const traderIds = Array.from(new Set(schedules.map((s) => s.application.traderId)));
  const traders = traderIds.length
    ? await db.user.findMany({ where: { id: { in: traderIds } }, select: { id: true, name: true, orgName: true, phone: true } })
    : [];
  const traderBy = new Map(traders.map((t) => [t.id, t]));

  // AUDIT FINDING #29: `assigneeName` now carries the assignee's real name
  // (batch-fetched), matching what /schedule/allocate returns — no more cuid.
  const assigneeIds = Array.from(new Set(schedules.map((s) => s.assigneeId)));
  const assignees = assigneeIds.length
    ? await db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
    : [];
  const assigneeBy = new Map(assignees.map((a) => [a.id, a]));

  const now = Date.now();
  return jsonOk(
    schedules.map((s) => {
      const trader = traderBy.get(s.application.traderId);
      return {
        id: s.id,
        applicationId: s.applicationId,
        assigneeName: assigneeBy.get(s.assigneeId)?.name ?? s.assigneeId,
        assigneeKind: s.assigneeKind as "LMO" | "GATC",
        scheduledFor: s.scheduledFor.toISOString(),
        rescheduleCount: s.rescheduleCount,
        status: s.status,
        // AUDIT FINDING #112: the officer queue badges the APPLICATION status,
        // not the schedule status (which is always ASSIGNED/RESCHEDULED/DONE).
        appStatus: s.application.status,
        // AUDIT FINDING #97: RESCHEDULED jobs are overdue too once their date passes
        overdue: ["ASSIGNED", "RESCHEDULED"].includes(s.status) && s.scheduledFor.getTime() < now,
        instrumentCategory: s.application.instrument.category,
        instrumentSerial: s.application.instrument.serialNumber,
        traderName: trader?.name ?? null,
        traderOrg: trader?.orgName ?? null,
        traderPhone: trader?.phone ?? null,
      };
    })
  );
}