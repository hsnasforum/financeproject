import { describe, expect, it } from "vitest";
import { buildIndicatorCatalogRows, getIndicatorAnnotation } from "./annotations";
import { INDICATOR_SERIES_SPECS } from "./specs";

describe("planning v3 indicators annotations", () => {
  it("resolves SSOT annotation for known series", () => {
    const annotation = getIndicatorAnnotation("kr_usdkrw");
    expect(annotation.category).toBe("fx");
    expect(annotation.label).toBe("USDKRW");
  });

  it("falls back to general annotation for unknown series", () => {
    const annotation = getIndicatorAnnotation("unknown_series_x");
    expect(annotation.category).toBe("general");
    expect(annotation.seriesId).toBe("unknown_series_x");
  });

  it("builds deterministic catalog rows with display labels", () => {
    const rows = buildIndicatorCatalogRows(INDICATOR_SERIES_SPECS);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.id).toBe(rows.slice().sort((a, b) => a.id.localeCompare(b.id))[0]?.id);
    expect(rows.every((row) => row.annotation.category.length > 0)).toBe(true);
    expect(rows.every((row) => row.displayLabel.length > 0)).toBe(true);
  });
});
