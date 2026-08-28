import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole, type Session } from "@/lib/auth/session";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { toApplicationDTO } from "@/lib/auth/dto";

/** Scope (book MA2 item 6 ownership semantics): absent -> 404;
 *  TRADER non-owner -> AUTH_FORBIDDEN; LMO/GATC -> jurisdiction exact shape. */
async function scopeApplication(session: Session, id: string) {
  const application = await db.application.findUnique({
    where: { id },
    include: { instrument: { select: { district: true } } },
  });
  if (!application) return { error: jsonErr("NOT_FOUND", "Application not found") };
  if (session.role === "TRADER" && application.traderId !== session.userId) {
    return { error: jsonErr("AUTH_FORBIDDEN", "Not your application") };
  }
  if (session.role === "LMO" || session.role === "GATC") {
    const jurisdiction = assertJurisdiction(session, application.instrument.district);
    if (jurisdiction) return { error: jurisdiction };
  }
  return { application };
}

// Replaces the mock stub; scope-consistent with MA2 item 6 ownership semantics.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const { error, application } = await scopeApplication(session!, params.id);
  if (error) return error;
  return jsonOk(toApplicationDTO(application!));
}
