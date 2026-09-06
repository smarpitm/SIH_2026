import { jsonOk } from "@/packages/shared/api";
import type { DashCounts } from "@/packages/shared/types";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { SLA_TURNAROUND_DAYS } from "@/packages/shared/constants";
import { startOfBusinessMonth, startOfBusinessNextMonth } from "@/lib/time";

const DAY_MS = 86_400_000;

// book MA4 item 4 — GET /dashboards/admin
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "ADMIN");
  if (guard) return guard;

  // AUDIT FINDING #36: month windows use the business timezone (Asia/Kolkata),
  // not UTC month/day boundaries.
  const now = Date.now();
  const monthStart = startOfBusinessMonth();
  const nextMonth = startOfBusinessNextMonth();

  const [pendingApplications, verifiedThisMonth, expiringIn30d, slaBreaches] = await Promise.all([
    // AUDIT FINDING #37: "pending" = every non-terminal status — DRAFT,
    // SUBMITTED, SCHEDULED and CHECKED_IN are all unfinished work.
    db.application.count({
      where: { status: { in: ["DRAFT", "SUBMITTED", "SCHEDULED", "CHECKED_IN"] } },
    }),
    db.certificate.count({ where: { validFrom: { gte: monthStart, lt: nextMonth } } }),
    db.certificate.count({
      where: { status: { in: ["ACTIVE", "EXPIRING_SOON", "SUSPENDED"] }, validUntil: { gte: new Date(now), lte: new Date(now + 30 * DAY_MS) } },
    }),
    // SLA days come from the shared constant the UI copy renders too (finding #38)
    db.application.count({
      where: { status: "SCHEDULED", schedules: { some: { scheduledFor: { lt: new Date(now - SLA_TURNAROUND_DAYS * DAY_MS) } } } },
    }),
  ]);

  const pendencyByDistrict = await db.$queryRaw<{ district: string; pending: number }[]>`
    SELECT i."district" AS district, COUNT(*)::int AS pending
    FROM "Application" a
    JOIN "Instrument" i ON i."id" = a."instrumentId"
    WHERE a."status" IN ('DRAFT', 'SUBMITTED', 'SCHEDULED', 'CHECKED_IN')
    GROUP BY i."district"
    ORDER BY pending DESC`;

  const officerProductivity = await db.$queryRaw<
    { name: string; inspectionsThisMonth: number }[]
  >`
    SELECT u."name" AS name, COUNT(*)::int AS "inspectionsThisMonth"
    FROM "InspectionReport" r
    JOIN "User" u ON u."id" = r."inspectorId"
    WHERE r."createdAt" >= ${monthStart} AND r."createdAt" < ${nextMonth}
    GROUP BY u."id", u."name"
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