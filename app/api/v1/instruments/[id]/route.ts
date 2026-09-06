import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole, type Session } from "@/lib/auth/session";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { toInstrumentDTO } from "@/lib/auth/dto";
import { audit } from "@/lib/auth/audit";

/** Scope guard (book MA2 item 5). Absent -> 404. TRADER non-owner -> AUTH_FORBIDDEN
 *  (MA2 MANUAL CHECK #5). LMO/GATC wrong district -> JURISDICTION_FORBIDDEN exact shape. */
async function scopeInstrument(session: Session, id: string) {
  const instrument = await db.instrument.findUnique({ where: { id } });
  if (!instrument) return { error: jsonErr("NOT_FOUND", "Instrument not found") };
  if (session.role === "TRADER" && instrument.ownerId !== session.userId) {
    return { error: jsonErr("AUTH_FORBIDDEN", "Not your instrument") };
  }
  if (session.role === "LMO" || session.role === "GATC") {
    const jurisdiction = assertJurisdiction(session, instrument.district);
    if (jurisdiction) return { error: jurisdiction };
  }
  return { instrument };
}

// book MA2 item 5 — GET /instruments/[id]
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const { error, instrument } = await scopeInstrument(session!, params.id);
  if (error) return error;
  return jsonOk(toInstrumentDTO(instrument!));
}

const patchSchema = z
  .object({
    address: z.string().min(1).optional(),
    capacity: z.string().min(1).optional(),
  })
  .refine((v) => v.address !== undefined || v.capacity !== undefined, {
    message: "nothing to update — only address and capacity are mutable",
  });

// book MA2 item 5 — PATCH /instruments/[id] (only address, capacity mutable)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const { error, instrument } = await scopeInstrument(session!, params.id);
  if (error) return error;

  // AUDIT FINDING #111: scopeInstrument is a READ scope — a same-district
  // LMO/GATC officer passes its jurisdiction gate but must never mutate a
  // trader's instrument (MA2 item 5: only the owner TRADER or ADMIN edits
  // instrument details).
  if (
    session!.role !== "ADMIN" &&
    (session!.role !== "TRADER" || instrument!.ownerId !== session!.userId)
  ) {
    return jsonErr("AUTH_FORBIDDEN", "Only the owner may edit this instrument");
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid patch payload", parsed.error.flatten());
  }

  const updated = await db.instrument.update({
    where: { id: params.id },
    data: parsed.data,
  });
  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "instrument.update",
    entity: "instrument",
    entityId: updated.id,
    meta: parsed.data,
  });
  return jsonOk(toInstrumentDTO(updated));
}
