import { describe, expect, it } from "vitest";
import { normalizeEligibilityLines } from "../src/lib/gov24/eligibilityNormalize";

describe("gov24 eligibility normalize", () => {
  it("removes exact/partial duplicates and strips non-target meta segments", () => {
    const raw = [
      "○ 부산광역시 거주 청년(만 19~34세)",
      "부산광역시 거주 청년(만 19~34세)",
      "부산광역시 거주 청년(만 19~34세), 기준중위소득 100% 이하, 신청방법: 온라인",
      "소관기관: 부산광역시청",
    ];

    const normalized = normalizeEligibilityLines(raw);
    const joined = normalized.raw.join(" | ");

    expect(normalized.raw.length).toBeGreaterThan(0);
    expect(joined.includes("신청방법:")).toBe(false);
    expect(joined.includes("소관기관:")).toBe(false);
    expect(normalized.raw.filter((line) => line.includes("부산광역시 거주 청년")).length).toBe(1);
  });

  it("builds categorized items for residence/age/income/asset", () => {
    const raw = [
      "부산시 거주",
      "연령: 만 19~34세",
      "기준중위소득 100% 이하",
      "총재산 3억 5천만원 이하",
      "신청기간: 2026-03-01~2026-03-31",
    ];

    const normalized = normalizeEligibilityLines(raw);
    const keys = normalized.items.map((entry) => entry.key);

    expect(keys).toContain("거주");
    expect(keys).toContain("연령");
    expect(keys).toContain("소득");
    expect(keys).toContain("재산");
    expect(normalized.items.length).toBeGreaterThanOrEqual(3);
  });
});
