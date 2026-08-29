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
    ? await db.user.findMany({ where: { id: { in: traderIds } }, select: { id: true, name: true, orgName: true } })
    : [];
  const traderBy = new Map(traders.map((t) => [t.id, t]));

  const now = Date.now();
  return jsonOk(
    schedules.map((s) => {
      const trader = traderBy.get(s.application.traderId);
      return {
        id: s.id,
        applicationId: s.applicationId,
        assigneeName: session!.userId === s.assigneeId ? session!.userId : s.assigneeId,
        assigneeKind: s.assigneeKind as "LMO" | "GATC",
        scheduledFor: s.scheduledFor.toISOString(),
        rescheduleCount: s.rescheduleCount,
        status: s.status,
        overdue: s.status === "ASSIGNED" && s.scheduledFor.getTime() < now,
        instrumentCategory: s.application.instrument.category,
        instrumentSerial: s.application.instrument.serialNumber,
        traderName: trader?.name ?? null,
        traderOrg: trader?.orgName ?? null,
      };
    })
  );
}