import { jsonOk } from "@/packages/shared/api";
import type { DashCounts } from "@/packages/shared/types";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";

const DAY_MS = 86400000;

// book MA4 item 2 — GET /dashboards/trader (envelope DashCounts shape EXACTLY)
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;
  const userId = session!.userId;

  const now = Date.now();
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

  const [pendingApplications, verifiedThisMonth, expiringIn30d, slaBreaches] = await Promise.all([
    // own applications still in-flight (DRAFT..SUBMITTED)
    db.application.count({
      where: { traderId: userId, status: { in: ["DRAFT", "SUBMITTED"] } },
    }),
    // certificates issued this month for own instruments
    db.certificate.count({
      where: { validFrom: { gte: monthStart, lt: nextMonth }, instrument: { ownerId: userId } },
    }),
    // certificates expiring within the next 30 days
    db.certificate.count({
      where: {
        status: { in: ["ACTIVE", "EXPIRING_SOON", "SUSPENDED"] },
        validUntil: { gte: new Date(now), lte: new Date(now + 30 * DAY_MS) },
        instrument: { ownerId: userId },
      },
    }),
    // applications still SCHEDULED more than 7 days without check-in
    db.application.count({
      where: {
        traderId: userId,
        status: "SCHEDULED",
        schedules: { some: { scheduledFor: { lt: new Date(now - 7 * DAY_MS) } } },
      },
    }),
  ]);

  return jsonOk({
    pendingApplications,
    verifiedThisMonth,
    expiringIn30d,
    slaBreaches,
  } satisfies DashCounts);
}