// DECISION DOC G6 verdict grammar (pure .ts so it's importable by vitest node tests
// — components/verify-ui.test.ts): colour verdict within 1.5s; icon accompanies every
// colour; signatureValid=false ALWAYS wins as red CHECK FAILED regardless of registry
// verdict (the honest-signature contract in lib/public/badge.ts).
export type BadgeTone = "green" | "amber" | "red";

export function verdictView(
  verdict: string,
  signatureValid: boolean
): { tone: BadgeTone; icon: string; wordKey: string; subKey?: string } {
  if (!signatureValid) return { tone: "red", icon: "✕", wordKey: "verdict.tampered" };
  switch (verdict) {
    case "VALID":
      return { tone: "green", icon: "✓", wordKey: "verdict.valid", subKey: "verify.signatureVerified" };
    case "EXPIRING_SOON":
      return { tone: "amber", icon: "⟳", wordKey: "verdict.expiring" };
    case "EXPIRED":
      return { tone: "red", icon: "✕", wordKey: "verdict.expired" };
    case "REVOKED":
      return { tone: "red", icon: "✕", wordKey: "verdict.revoked" };
    default:
      return { tone: "red", icon: "✕", wordKey: "verdict.tampered" };
  }
}
