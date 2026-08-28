import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { toUserDTO } from "@/lib/auth/dto";

// book MA1 item 7: getSession -> UserDTO
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return jsonErr("AUTH_REQUIRED", "Authentication required");

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return jsonErr("AUTH_REQUIRED", "Session user no longer exists");

  return jsonOk(toUserDTO(user));
}
