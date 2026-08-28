import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** One AuditLog row per state-changing route (book DoD rule 6, MA1 item 9). */
export async function audit(entry: {
  actorId: string | null;
  actorKind: string;
  action: string;
  entity: string;
  entityId: string;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      actorKind: entry.actorKind,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ...(entry.meta ? { meta: entry.meta } : {}),
    },
  });
}
