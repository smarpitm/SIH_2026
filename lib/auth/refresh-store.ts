// ponytail: in-memory revocation — Redis set if time allows. (book MA1 item 5)
// familyId -> number of rotations consumed. A refresh token of generation `gen`
// is live only while gen === usedCount (i.e. it is the newest, never-presented
// token of its family). Presenting an older generation => reuse => revoke family.
const families = new Map<string, number>();

/** undefined when the family is unknown/revoked/never rotated. */
export function familyUsedCount(familyId: string): number | undefined {
  return families.get(familyId);
}

export function recordRotation(familyId: string): number {
  const next = (families.get(familyId) ?? 0) + 1;
  families.set(familyId, next);
  return next;
}

export function revokeFamily(familyId: string): void {
  families.delete(familyId);
}
