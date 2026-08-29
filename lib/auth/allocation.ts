import { db } from "@/lib/db";

/** (book MA3 item 1)
 *  Auto-allocation: among Users in (LMO,GATC) for the instrument's district, pick the
 *  officer with the fewest open ASSIGNED schedules; tie -> earliest createdAt.
 *  Returns the selected officer, or null when no candidate qualifies in the district.
 */
export async function pickAllocationOfficer(district: string) {
  const officers = await db.user.findMany({
    where: { role: { in: ["LMO", "GATC"] }, district },
  });
  if (officers.length === 0) return null;

  const counts = await db.schedule.groupBy({
    by: ["assigneeId"],
    where: { status: "ASSIGNED" },
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