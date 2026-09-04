import { z } from "zod";
import { Prisma } from "@prisma/client";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { INSTRUMENT_CATEGORIES, DISTRICTS } from "@/packages/shared/constants";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { toInstrumentDTO } from "@/lib/auth/dto";
import { audit } from "@/lib/auth/audit";
import {
  storeUpload,
  UnsupportedMediaTypeError,
  requestBodyTooLarge,
  requestLimitMessage,
  PROOF_REQUEST_LIMIT_BYTES,
} from "@/lib/uploads/multipart";

const querySchema = z.object({
  district: z.enum(DISTRICTS).optional(),
  category: z.enum(INSTRUMENT_CATEGORIES).optional(),
  q: z.string().min(1).max(64).optional(), // serial ILIKE contains
});

// book MA2 item 3 — GET /instruments
export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsedQuery.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid query", parsedQuery.error.flatten());
  }
  const { district, category, q } = parsedQuery.data;

  const where: Prisma.InstrumentWhereInput = {
    // TRADER: own only · LMO/GATC: jurisdiction per-row ≡ their district · ADMIN: all
    ...(session!.role === "TRADER" ? { ownerId: session!.userId } : {}),
    ...(session!.role === "LMO" || session!.role === "GATC"
      ? { district: session!.district ?? "__none__" }
      : {}),
    ...(district ? { district } : {}),
    ...(category ? { category } : {}),
    ...(q ? { serialNumber: { contains: q, mode: "insensitive" } } : {}),
  };

  const instruments = await db.instrument.findMany({ where, orderBy: { createdAt: "desc" } });
  return jsonOk(instruments.map(toInstrumentDTO));
}

const instrumentFieldsSchema = z.object({
  category: z.enum(INSTRUMENT_CATEGORIES),
  make: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().regex(/^.{2,64}$/),
  capacity: z.string().min(1),
  district: z.enum(DISTRICTS),
  address: z.string().min(1),
});

// book MA2 item 4 — POST /instruments (TRADER only, multipart with optional proof)
export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;

  // AUDIT FINDING #16: hard request cap BEFORE formData() buffers the body
  if (requestBodyTooLarge(req, PROOF_REQUEST_LIMIT_BYTES)) {
    return jsonErr("VALIDATION_ERROR", requestLimitMessage(PROOF_REQUEST_LIMIT_BYTES));
  }
  const form = await req.formData().catch(() => null);
  if (!form) return jsonErr("VALIDATION_ERROR", "multipart/form-data body required");

  const parsed = instrumentFieldsSchema.safeParse({
    category: form.get("category"),
    make: form.get("make"),
    model: form.get("model"),
    serialNumber: form.get("serialNumber"),
    capacity: form.get("capacity"),
    district: form.get("district"),
    address: form.get("address"),
  });
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid instrument payload", parsed.error.flatten());
  }

  // AUDIT FINDING #57 (policy decision): traders are district-bound. An
  // instrument is inspected by its district's officers, so it must be
  // registered in the trader's own home district — otherwise a trader could
  // trigger allocation (and field work) in a district they have no tie to.
  if (session!.district && parsed.data.district !== session!.district) {
    return jsonErr(
      "JURISDICTION_FORBIDDEN",
      "Instruments must be registered in your own home district",
      {
        required: `district:${parsed.data.district}`,
        have: `district:${session!.district}`,
      }
    );
  }

  const proof = form.get("purchaseProof");
  let purchaseProofKey: string | null = null;
  if (proof instanceof File && proof.size > 0) {
    try {
      const stored = await storeUpload(proof, "instrument-proofs");
      purchaseProofKey = stored.key;
    } catch (e) {
      if (e instanceof UnsupportedMediaTypeError) {
        return jsonErr("UNSUPPORTED_MEDIA_TYPE", e.reason, { reason: e.reason });
      }
      throw e;
    }
  }

  try {
    const instrument = await db.instrument.create({
      data: {
        ownerId: session!.userId,
        ...parsed.data,
        ...(purchaseProofKey ? { purchaseProofKey } : {}),
      },
    });
    await audit({
      actorId: session!.userId,
      actorKind: session!.role,
      action: "instrument.create",
      entity: "instrument",
      entityId: instrument.id,
      meta: { serialNumber: instrument.serialNumber, district: instrument.district },
    });
    return jsonOk(toInstrumentDTO(instrument));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonErr("CONFLICT", "An instrument with this serial number already exists in this district");
    }
    throw e;
  }
}
