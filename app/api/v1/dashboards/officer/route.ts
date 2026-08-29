import { jsonOk } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";

// book MA4 item 3 — GET /dashboards/officer (calling LMO/GATC)
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "LMO", "GATC");
  if (guard) return guard;
  const userId = session!.userId;

  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

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
      db.schedule.count({ where: { assigneeId: userId, status: "ASSIGNED", scheduledFor: { lt: new Date(now) } } }),
      db.schedule.count({ where: { assigneeId: userId } }),
      db.inspectionReport.count({ where: { inspectorId: userId } }),
      db.inspectionReport.count({ where: { inspectorId: userId, createdAt: { gte: monthStart, lt: nextMonth } } }),
    ]);

  // trader names for the today-schedule list
  const traderIds = Array.from(
    new Set(todayRows.map((s) => s.application.traderId).filter(Boolean)) as Set<string>
  );
  const traders = traderIds.length
    ? await db.user.findMany({ where: { id: { in: traderIds } }, select: { id: true, name: true, orgName: true } })
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
        overdue: s.status === "ASSIGNED" && s.scheduledFor.getTime() < now,
        instrumentCategory: s.application.instrument.category,
        instrumentSerial: s.application.instrument.serialNumber,
        traderName: trader?.name ?? null,
        traderOrg: trader?.orgName ?? null,
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