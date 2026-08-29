import { jsonOk } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";

// book MA4 item 5 — GET /notifications (own rows, newest first)
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const rows = await db.notification.findMany({
    where: { userId: session!.userId },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk(
    rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }))
  );
}