import { jsonOk } from "@/packages/shared/api";
import type { DashCounts } from "@/packages/shared/types";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";

const DAY_MS = 86400000;

// book MA4 item 4 — GET /dashboards/admin
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "ADMIN");
  if (guard) return guard;

  const now = Date.now();
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

  const [pendingApplications, verifiedThisMonth, expiringIn30d, slaBreaches] = await Promise.all([
    db.application.count({ where: { status: { in: ["DRAFT", "SUBMITTED"] } } }),
    db.certificate.count({ where: { validFrom: { gte: monthStart, lt: nextMonth } } }),
    db.certificate.count({
      where: { status: { in: ["ACTIVE", "EXPIRING_SOON", "SUSPENDED"] }, validUntil: { gte: new Date(now), lte: new Date(now + 30 * DAY_MS) } },
    }),
    db.application.count({
      where: { status: "SCHEDULED", schedules: { some: { scheduledFor: { lt: new Date(now - 7 * DAY_MS) } } } },
    }),
  ]);

  const pendencyByDistrict = await db.$queryRaw<{ district: string; pending: number }[]>`
    SELECT i."district" AS district, COUNT(*)::int AS pending
    FROM "Application" a
    JOIN "Instrument" i ON i."id" = a."instrumentId"
    WHERE a."status" IN ('DRAFT', 'SUBMITTED')
    GROUP BY i."district"
    ORDER BY pending DESC`;

  const officerProductivity = await db.$queryRaw<
    { name: string; inspectionsThisMonth: number }[]
  >`
    SELECT u."name" AS name, COUNT(*)::int AS "inspectionsThisMonth"
    FROM "InspectionReport" r
    JOIN "User" u ON u."id" = r."inspectorId"
    WHERE r."createdAt" >= ${monthStart}
    GROUP BY u."name"
    ORDER BY "inspectionsThisMonth" DESC
    LIMIT 5`;

  return jsonOk({
    kpis: {
      pendingApplications,
      verifiedThisMonth,
      expiringIn30d,
      slaBreaches,
    } satisfies DashCounts,
    pendencyByDistrict,
    officerProductivity,
  });
}