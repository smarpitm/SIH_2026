import { describe, expect, it } from "vitest";
import { buildExportUrl } from "./export-url";

describe("buildExportUrl", () => {
  it("adds entity + format=csv on a bare call", () => {
    expect(buildExportUrl("instruments")).toBe("/api/v1/reports/export?entity=instruments&format=csv");
  });

  it("preserves current page filters and tolerates the leading ?", () => {
    expect(buildExportUrl("applications", "?district=GUNTUR")).toBe(
      "/api/v1/reports/export?district=GUNTUR&entity=applications&format=csv"
    );
    expect(buildExportUrl("certificates", "status=ACTIVE")).toBe(
      "/api/v1/reports/export?status=ACTIVE&entity=certificates&format=csv"
    );
  });
});