import { describe, expect, it } from "vitest";
import { __test__ as benefitsTest } from "../src/lib/publicApis/providers/benefits";

describe("benefits region strict mode", () => {
  it("does not classify as busan when only title/org mention busan", () => {
    const normalized = benefitsTest.normalizeBenefits([
      {
        서비스명: "부산 청년 금융지원",
        서비스설명: "기관 안내",
        소관기관명: "부산은행",
        신청방법: "온라인",
      },
    ]);

    const item = normalized.items[0];
    expect(item?.region.scope).toBe("UNKNOWN");
    expect(item?.region.tags).toContain("미상");
    expect(item?.region.sido).toBeUndefined();
  });

  it("classifies as regional only when explicit region keys exist", () => {
    const normalized = benefitsTest.normalizeBenefits([
      {
        서비스명: "청년 주거 지원",
        서비스설명: "부산 해운대구 대상",
        지원지역: "부산광역시 해운대구",
      },
    ]);

    const item = normalized.items[0];
    expect(item?.region.scope).toBe("REGIONAL");
    expect(item?.region.tags).toContain("부산");
  });
});
