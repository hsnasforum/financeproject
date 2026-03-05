import { describe, expect, it } from "vitest";
import {
  assertNoRecommendationText,
  noRecommendationText,
  sanitizeNoRecommendationText,
} from "../src/lib/news/noRecommendation";

describe("news no-recommendation guard", () => {
  it("rejects banned recommendation phrases", () => {
    const banned = [
      "지금은 매수 해야 합니다",
      "정답은 매도입니다",
      "무조건 오른다",
      "확실한 수익",
      "지금 팔아야 한다",
    ];

    for (const row of banned) {
      expect(noRecommendationText(row)).toBe(false);
      expect(() => assertNoRecommendationText(row, "test")).toThrow(/FORBIDDEN_RECOMMENDATION/);
    }
  });

  it("allows neutral conditional language", () => {
    const allowed = "변동성 확대 가능성이 있어 모니터링 옵션을 검토합니다.";
    expect(noRecommendationText(allowed)).toBe(true);
  });

  it("sanitizes banned words into neutral wording", () => {
    const sanitized = sanitizeNoRecommendationText("매수/매도가 확실하니 지금 해야 한다");
    expect(sanitized).not.toMatch(/매수|매도|확실|해야\s*한다/);
    expect(sanitized).toContain("검토");
  });
});
