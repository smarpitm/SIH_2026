// tests/pdf-fit.test.ts — regression for audit finding #48: dynamic registry
// values (long owner names / serials / cert ids) must be truncated to the fixed
// layout column instead of overflowing the certificate/sticker PDF. Uses real
// embedded font metrics so the width math matches what pdf-lib will draw.
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { fitValue } from "../lib/pdf/certificate";

async function helveticaBold(): Promise<PDFFont> {
  const pdf = await PDFDocument.create();
  return pdf.embedFont(StandardFonts.HelveticaBold);
}

describe("fitValue (PDF long-value truncation)", () => {
  it("leaves short values untouched", async () => {
    const font = await helveticaBold();
    const text = "Ravi Kumar";
    expect(fitValue(font, text, 12, 300)).toBe(text);
  });

  it("truncates a long value with an ellipsis and stays within the column width", async () => {
    const font = await helveticaBold();
    const maxWidth = 200;
    const long = "SHAH NAWAB KHAN ENTERPRISES PVT LTD — GUNTUR BRANCH UNIT 12B".repeat(2);
    const fitted = fitValue(font, long, 12, maxWidth);
    expect(fitted.length).toBeLessThan(long.length);
    expect(fitted.endsWith("…")).toBe(true);
    expect(font.widthOfTextAtSize(fitted, 12)).toBeLessThanOrEqual(maxWidth);
  });

  it("truncates a long serial number to the sticker column width", async () => {
    const font = await helveticaBold();
    const maxWidth = 190; // sticker value column ≈ 67mm
    const serial = `WB-${"9".repeat(120)}`;
    const fitted = fitValue(font, serial, 9.5, maxWidth);
    expect(fitted.endsWith("…")).toBe(true);
    expect(font.widthOfTextAtSize(fitted, 9.5)).toBeLessThanOrEqual(maxWidth);
  });
});
