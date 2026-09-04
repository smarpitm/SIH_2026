// Durable refresh-token family state (audit finding #2). Replaces the former
// process-local Map: families live in Postgres (prisma RefreshFamily) so
// replay detection survives process restarts and works across instances.
//
// Semantics (unchanged from the in-memory design, book MA1 item 5):
//   gen = number of rotations consumed. The newest live token of a family
//   presents gen === row.gen; presenting an OLDER generation is reuse ->
//   revoke the whole family. Rotation is a compare-and-set guarded
//   updateMany(gen = presented) so concurrent presenters of the same token
//   are serialized by the row lock and exactly one wins.
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

// Keep in sync with REFRESH_TTL in lib/auth/jwt.ts (7 days).
const FAMILY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type RotateOutcome =
  | "rotated"   // token was the live newest generation -> consumed, caller issues gen+1
  | "unknown"   // no such family row (garbage/forged family id)
  | "expired"   // family outlived its TTL
  | "reused"    // replay of an older generation (or revoked family) -> revoked
  | "future";   // generation ahead of family state -> impossible token

/** Called at login: starts a new family at gen 0. */
export async function createFamily(userId: string): Promise<string> {
  const family = await db.refreshFamily.create({
    data: {
      id: randomUUID(),
      userId,
      gen: 0,
      expiresAt: new Date(Date.now() + FAMILY_TTL_MS),
    },
  });
  return family.id;
}

/** Atomic compare-and-set rotation. Never throws for auth outcomes. */
export async function rotateFamily(
  familyId: string,
  presentedGen: number
): Promise<RotateOutcome> {
  const row = await db.refreshFamily.findUnique({ where: { id: familyId } });
  if (!row) return "unknown";
  if (row.revoked) return "reused";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  if (presentedGen > row.gen) return "future";
  if (presentedGen < row.gen) {
    await revokeFamily(familyId);
    return "reused";
  }
  // CAS: guarded update — concurrent presenters of the same generation are
  // serialized by the row lock; exactly one increment succeeds.
  const res = await db.refreshFamily.updateMany({
    where: { id: familyId, gen: presentedGen, revoked: false },
    data: { gen: { increment: 1 } },
  });
  return res.count === 1 ? "rotated" : "reused";
}

export async function revokeFamily(familyId: string): Promise<void> {
  await db.refreshFamily.updateMany({
    where: { id: familyId, revoked: false },
    data: { revoked: true },
  });
}

