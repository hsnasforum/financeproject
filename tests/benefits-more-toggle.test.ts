import { describe, expect, it } from "vitest";
import { __test__ as benefitsTest } from "../src/lib/publicApis/providers/benefits";

describe("benefits eligibility preview", () => {
  it("marks long eligibility text as truncated and keeps full text", () => {
    const longHint = "조건 ".repeat(120);
    const normalized = benefitsTest.normalizeBenefits([
      {
        serviceId: "T1",
        serviceName: "긴조건 테스트",
        description: "요약",
        hint: longHint,
      },
    ]);

    const item = normalized.items[0];
    expect(item).toBeTruthy();
    expect(item?.eligibilityText && item.eligibilityExcerpt).toBeTruthy();
    expect(item?.isEligibilityTruncated).toBe(true);
    expect((item?.eligibilityText?.length ?? 0)).toBeGreaterThan(item?.eligibilityExcerpt?.length ?? 0);
  });
});
