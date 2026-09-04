import { db } from "@/lib/db";

/** (book MA3 item 1)
 *  Auto-allocation: among Users in (LMO,GATC) for the instrument's district, pick the
 *  officer with the fewest open ASSIGNED schedules; tie -> earliest createdAt.
 *  Returns the selected officer, or null when no candidate qualifies in the district.
 *  AUDIT FINDINGS #33/#34/#35:
 *   - the workload query is scoped to the candidate officers (no global scan);
 *   - RESCHEDULED schedules count as open workload (those jobs are still live);
 *   - `excludeAssigneeId` supports manual reallocation that actually moves the
 *     job to a different officer.
 */
export async function pickAllocationOfficer(
  district: string,
  excludeAssigneeId?: string
) {
  const officers = await db.user.findMany({
    where: {
      role: { in: ["LMO", "GATC"] },
      district,
      ...(excludeAssigneeId ? { id: { not: excludeAssigneeId } } : {}),
    },
  });
  if (officers.length === 0) return null;

  const counts = await db.schedule.groupBy({
    by: ["assigneeId"],
    where: {
      status: { in: ["ASSIGNED", "RESCHEDULED"] },
      assigneeId: { in: officers.map((o) => o.id) },
    },
    _count: { _all: true },
  });
  const openByAssignee = new Map(counts.map((c) => [c.assigneeId, c._count._all]));

  return officers.sort((a, b) => {
    const ca = openByAssignee.get(a.id) ?? 0;
    const cb = openByAssignee.get(b.id) ?? 0;
    if (ca !== cb) return ca - cb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}