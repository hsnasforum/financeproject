import { describe, expect, it } from "vitest";
import { normalizeSeriesId } from "./aliases";

describe("planning v3 indicators aliases", () => {
  it("normalizes upper aliases to canonical ids", () => {
    expect(normalizeSeriesId("KR_BOK_BASE_RATE")).toBe("kr_base_rate");
    expect(normalizeSeriesId("KR_USDKRW")).toBe("kr_usdkrw");
    expect(normalizeSeriesId("BRENT_OIL")).toBe("brent_oil");
  });

  it("normalizes unknown ids to lower_snake_case", () => {
    expect(normalizeSeriesId("My.Custom-Series")).toBe("my_custom_series");
  });
});
