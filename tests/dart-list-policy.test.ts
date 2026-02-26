import { describe, expect, it } from "vitest";
import { normalizeListQuery } from "../src/lib/publicApis/dart/list";
import { mapOpenDartStatus } from "../src/lib/publicApis/dart/opendartErrors";

describe("normalizeListQuery", () => {
  it("clamps range to 3 months when corp_code is missing", () => {
    const params = new URLSearchParams({
      bgn_de: "20240101",
      end_de: "20240630",
    });

    const normalized = normalizeListQuery(params);

    expect(normalized.params.end_de).toBe("20240630");
    expect(normalized.params.bgn_de).toBe("20240330");
    expect(normalized.assumptions.length).toBeGreaterThan(0);
  });
});

describe("mapOpenDartStatus", () => {
  it("maps rate limit and list no-data status", () => {
    expect(mapOpenDartStatus("020", "요청 제한", "company").httpStatus).toBe(429);
    expect(mapOpenDartStatus("013", "조회된 데이터가 없음", "list").httpStatus).toBe(404);
  });
});
