import type { User, Instrument, Application } from "@prisma/client";
import type { UserDTO, InstrumentDTO, ApplicationDTO } from "@/packages/shared/types";

/** Prisma User -> frozen UserDTO (packages/shared/types.ts). Optional fields are
 *  emitted only when present, matching the shared mock shape exactly. phone is
 *  exposed so authenticated counterparties (officer↔trader) can reach each other —
 *  it is NEVER emitted on public certificate/verification payloads. */
export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.orgName ? { orgName: user.orgName } : {}),
    ...(user.district ? { district: user.district } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
  };
}

/** Prisma Instrument -> frozen InstrumentDTO (MA2 items 3-5). */
export function toInstrumentDTO(i: Instrument): InstrumentDTO {
  return {
    id: i.id,
    category: i.category,
    make: i.make,
    model: i.model,
    serialNumber: i.serialNumber,
    capacity: i.capacity,
    district: i.district,
    address: i.address,
    createdAt: i.createdAt.toISOString(),
  };
}

/** Prisma Application -> frozen ApplicationDTO (MA2 items 6-8). Optional fields are
 *  emitted only when present, matching the shared mock shape exactly. */
export function toApplicationDTO(a: Application): ApplicationDTO {
  return {
    id: a.id,
    instrumentId: a.instrumentId,
    type: a.type,
    status: a.status,
    ...(a.preferredDate ? { preferredDate: a.preferredDate.toISOString() } : {}),
    ...(a.feePaidAt ? { feePaidAt: a.feePaidAt.toISOString() } : {}),
    createdAt: a.createdAt.toISOString(),
  };
}
