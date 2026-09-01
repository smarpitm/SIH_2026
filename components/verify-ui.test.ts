import { describe, it, expect } from "vitest";
import { verdictView } from "./verdict";
import { translate } from "@/lib/i18n/useTranslation";

// G6 verdict grammar + N1 i18n fallback (K5 verify UI wiring)
describe("verdictView (DECISION DOC G6 grammar)", () => {
  it("green shield VALID — SIGNATURE VERIFIED", () => {
    expect(verdictView("VALID", true)).toMatchObject({
      tone: "green",
      icon: "✓",
      wordKey: "verdict.valid",
      subKey: "verify.signatureVerified",
    });
  });

  it("amber EXPIRING SOON", () => {
    expect(verdictView("EXPIRING_SOON", true)).toMatchObject({
      tone: "amber",
      icon: "⟳",
      wordKey: "verdict.expiring",
    });
  });

  it("red EXPIRED / REVOKED", () => {
    expect(verdictView("EXPIRED", true)).toMatchObject({ tone: "red", wordKey: "verdict.expired" });
    expect(verdictView("REVOKED", true)).toMatchObject({ tone: "red", wordKey: "verdict.revoked" });
  });

  it("signatureValid=false ALWAYS wins -> red CHECK FAILED, any verdict", () => {
    for (const v of ["VALID", "EXPIRING_SOON", "EXPIRED", "REVOKED", "garbage"]) {
      expect(verdictView(v, false)).toMatchObject({
        tone: "red",
        icon: "✕",
        wordKey: "verdict.tampered",
      });
    }
  });
});

describe("translate (N1 hook, English fallback)", () => {
  it("existing keys resolve per language", () => {
    expect(translate("en", "verdict.valid")).toBe("Certified Valid");
    expect(translate("hi", "verdict.valid")).toBe("प्रमाणित");
    expect(translate("en", "verdict.tampered")).toBe("CHECK FAILED — POSSIBLE FAKE");
  });

  it("missing hi key falls back to English dict, then caller fallback, then key", () => {
    expect(translate("hi", "verify.reportAction", "Report to your Local Legal Metrology office")).toBe(
      "Report to your Local Legal Metrology office"
    );
    expect(translate("hi", "no.such.key.anywhere")).toBe("no.such.key.anywhere");
  });
});