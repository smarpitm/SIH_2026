import { jsonOk } from "@/packages/shared/api";
import type { DashCounts } from "@/packages/shared/types";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { SLA_TURNAROUND_DAYS } from "@/packages/shared/constants";
import { startOfBusinessMonth, startOfBusinessNextMonth } from "@/lib/time";

const DAY_MS = 86_400_000;

// book MA4 item 2 — GET /dashboards/trader (envelope DashCounts shape EXACTLY)
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;
  const userId = session!.userId;

  // AUDIT FINDING #36: month windows use the business timezone.
  const now = Date.now();
  const monthStart = startOfBusinessMonth();
  const nextMonth = startOfBusinessNextMonth();

  const [pendingApplications, verifiedThisMonth, expiringIn30d, slaBreaches] = await Promise.all([
    // own applications still in-flight — AUDIT FINDING #37: every non-terminal
    // status counts as pending (DRAFT through CHECKED_IN).
    db.application.count({
      where: {
        traderId: userId,
        status: { in: ["DRAFT", "SUBMITTED", "SCHEDULED", "CHECKED_IN"] },
      },
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
    // applications still SCHEDULED beyond the shared SLA turnaround (finding #38)
    db.application.count({
      where: {
        traderId: userId,
        status: "SCHEDULED",
        schedules: { some: { scheduledFor: { lt: new Date(now - SLA_TURNAROUND_DAYS * DAY_MS) } } },
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