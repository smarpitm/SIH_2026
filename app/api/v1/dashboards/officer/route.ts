import { jsonOk } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { startOfBusinessToday, startOfBusinessTomorrow, startOfBusinessMonth, startOfBusinessNextMonth } from "@/lib/time";

// book MA4 item 3 — GET /dashboards/officer (calling LMO/GATC)
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "LMO", "GATC");
  if (guard) return guard;
  const userId = session!.userId;

  // AUDIT FINDING #36: "today"/"this month" windows use the business timezone.
  const now = Date.now();
  const dayStart = startOfBusinessToday();
  const dayEnd = startOfBusinessTomorrow();
  const monthStart = startOfBusinessMonth();
  const nextMonth = startOfBusinessNextMonth();

  const [todayRows, overdueCount, totalSchedules, completedInspections, thisMonthInspections] =
    await Promise.all([
      db.schedule.findMany({
        where: {
          assigneeId: userId,
          scheduledFor: { gte: dayStart, lt: dayEnd },
          status: { in: ["ASSIGNED", "RESCHEDULED"] },
        },
        orderBy: { scheduledFor: "asc" },
        include: { application: { include: { instrument: { select: { category: true, serialNumber: true } } } } },
      }),
      db.schedule.count({
        where: {
          assigneeId: userId,
          // AUDIT FINDING #97: a rescheduled job keeps status RESCHEDULED — its
          // overdue tracking must not silently exclude it.
          status: { in: ["ASSIGNED", "RESCHEDULED"] },
          scheduledFor: { lt: new Date(now) },
        },
      }),
      db.schedule.count({ where: { assigneeId: userId } }),
      db.inspectionReport.count({ where: { inspectorId: userId } }),
      db.inspectionReport.count({ where: { inspectorId: userId, createdAt: { gte: monthStart, lt: nextMonth } } }),
    ]);

  // trader names for the today-schedule list
  const traderIds = Array.from(
    new Set(todayRows.map((s) => s.application.traderId).filter(Boolean)) as Set<string>
  );
  const traders = traderIds.length
    ? await db.user.findMany({ where: { id: { in: traderIds } }, select: { id: true, name: true, orgName: true, phone: true } })
    : [];
  const traderBy = new Map(traders.map((t) => [t.id, t]));

  return jsonOk({
    todaySchedule: todayRows.map((s) => {
      const trader = traderBy.get(s.application.traderId);
      return {
        scheduleId: s.id,
        applicationId: s.applicationId,
        scheduledFor: s.scheduledFor.toISOString(),
        status: s.status,
        // AUDIT FINDING #97: RESCHEDULED jobs are overdue too once their date passes
        overdue: ["ASSIGNED", "RESCHEDULED"].includes(s.status) && s.scheduledFor.getTime() < now,
        instrumentCategory: s.application.instrument.category,
        instrumentSerial: s.application.instrument.serialNumber,
        traderName: trader?.name ?? null,
        traderOrg: trader?.orgName ?? null,
        traderPhone: trader?.phone ?? null,
      };
    }),
    overdueCount,
    stats: {
      totalSchedules,
      completedInspections,
      thisMonthInspections,
    },
  });
}