import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { FEE_PAISA } from "@/packages/shared/constants";
import { db } from "@/lib/db";
import { getSession, requireRole, type Session } from "@/lib/auth/session";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { toApplicationDTO } from "@/lib/auth/dto";
import { audit } from "@/lib/auth/audit";
import { startOfBusinessToday } from "@/lib/time";

const bodySchema = z.object({
  instrumentId: z.string().min(1),
  type: z.enum(["NEW", "RE_VERIFICATION"]),
  // preferredDate is a FUTURE-or-today date, validated against the start of
  // "today" in the BUSINESS timezone (Asia/Kolkata) — audit finding #15. This
  // removes the old UTC edge where local "today" could be flagged as past.
  preferredDate: z
    .string()
    .datetime()
    .refine((v) => new Date(v).getTime() >= startOfBusinessToday().getTime(), {
      message: "preferredDate must be today or a future date",
    })
    .optional(),
  reVerificationReason: z.string().min(1).optional(),
});

// book MA2 item 6 — POST /applications (TRADER only, must own the instrument)
export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid application payload", parsed.error.flatten());
  }

  const instrument = await db.instrument.findUnique({
    where: { id: parsed.data.instrumentId },
  });
  if (!instrument) return jsonErr("NOT_FOUND", "Instrument not found");
  if (instrument.ownerId !== session!.userId) {
    return jsonErr("AUTH_FORBIDDEN", "You do not own this instrument");
  }

  // AUDIT FINDING (duplicate open applications): at most one non-terminal
  // application per instrument — a second open application would double-book
  // the same physical instrument for inspection.
  // AUDIT FINDING #102: PASSED is non-terminal too (the certificate issues a
  // moment later, but a crash/retry could strand it) — include it so a PASSED
  // instrument cannot take a second concurrent application.
  const openApplication = await db.application.findFirst({
    where: {
      instrumentId: instrument.id,
      status: { in: ["DRAFT", "SUBMITTED", "SCHEDULED", "CHECKED_IN", "PASSED"] },
    },
    select: { id: true },
  });
  if (openApplication) {
    return jsonErr("CONFLICT", "An open application already exists for this instrument");
  }

  const application = await db.application.create({
    data: {
      instrumentId: instrument.id,
      traderId: session!.userId,
      type: parsed.data.type,
      feeAmount: FEE_PAISA,
      ...(parsed.data.preferredDate ? { preferredDate: new Date(parsed.data.preferredDate) } : {}),
      ...(parsed.data.reVerificationReason ? { reVerificationReason: parsed.data.reVerificationReason } : {}),
    },
  });
  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "application.create",
    entity: "application",
    entityId: application.id,
    meta: { instrumentId: instrument.id, type: application.type },
  });
  return jsonOk(toApplicationDTO(application));
}

/** Scope for the GET list (replaces the mock stub; the book's MA2 items define POST only).
 *  TRADER: own · LMO/GATC: applications of instruments in their district · ADMIN: all. */
function listScope(session: Session) {
  if (session.role === "TRADER") return { traderId: session.userId };
  if (session.role === "LMO" || session.role === "GATC") {
    return { instrument: { district: session.district ?? "__none__" } };
  }
  return {};
}

export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const applications = await db.application.findMany({
    where: listScope(session!),
    orderBy: { createdAt: "desc" },
    include: { instrument: { select: { district: true } } },
  });
  const districtOf = new Map(applications.map((a) => [a.id, a.instrument.district]));
  // LMO/GATC per-row jurisdiction assert (exact shape via assertJurisdiction)
  if (session!.role === "LMO" || session!.role === "GATC") {
    for (const a of applications) {
      const jurisdiction = assertJurisdiction(session!, districtOf.get(a.id));
      if (jurisdiction) return jurisdiction;
    }
  }
  return jsonOk(applications.map(toApplicationDTO));
}
