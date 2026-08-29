import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";

const readSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

// book MA4 item 5 — PATCH /notifications/read { ids[] } → readAt = now
export async function PATCH(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const parsed = readSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten());
  }

  const res = await db.notification.updateMany({
    where: { id: { in: parsed.data.ids }, userId: session!.userId },
    data: { readAt: new Date() },
  });
  return jsonOk({ updated: res.count });
}