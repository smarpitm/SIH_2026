import type { User } from "@prisma/client";
import type { UserDTO } from "@/packages/shared/types";

/** Prisma User -> frozen UserDTO (packages/shared/types.ts). Optional fields are
 *  emitted only when present, matching the shared mock shape exactly. */
export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.orgName ? { orgName: user.orgName } : {}),
    ...(user.district ? { district: user.district } : {}),
  };
}
