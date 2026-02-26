import { describe, expect, it } from "vitest";
import {
  pickUnifiedSelectedOption,
  unifiedProductsToRecommendCandidates,
} from "../src/lib/recommend/unifiedAdapter";
import { type UnifiedProductView } from "../src/lib/sources/unified";

function baseItem(overrides?: Partial<UnifiedProductView>): UnifiedProductView {
  return {
    stableId: "FIN-001",
    sourceId: "finlife",
    kind: "deposit",
    externalKey: "FIN-001",
    providerName: "테스트은행",
    productName: "테스트예금",
    options: [],
    ...overrides,
  };
}

describe("recommend unified adapter", () => {
  it("selects nearest preferred term option first, then rateMode policy", () => {
    const item = baseItem({
      options: [
        { sourceId: "finlife", termMonths: 6, saveTrm: "6", intrRate: 3.1, intrRate2: 3.4 },
        { sourceId: "finlife", termMonths: 12, saveTrm: "12", intrRate: 3.0, intrRate2: 3.3 },
        { sourceId: "finlife", termMonths: 24, saveTrm: "24", intrRate: 3.5, intrRate2: 3.8 },
      ],
    });

    const selected = pickUnifiedSelectedOption(item.options, { preferredTerm: 12, rateMode: "max" });
    expect(selected.option?.save_trm).toBe("12");
    expect(selected.option?.intr_rate2).toBe(3.3);
  });

  it("falls back safely when options are empty", () => {
    const item = baseItem({ options: [] });
    const candidates = unifiedProductsToRecommendCandidates({
      items: [item],
      profile: { preferredTerm: 12, rateMode: "base" },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.product.options).toHaveLength(0);
    expect(candidates[0]?.extraReasons?.[0]).toContain("통합 옵션 없음");
  });

  it("handles missing term text by using rate-only fallback", () => {
    const item = baseItem({
      options: [
        { sourceId: "finlife", termMonths: null, saveTrm: "", intrRate: 2.1, intrRate2: 2.2 },
        { sourceId: "finlife", termMonths: null, saveTrm: "", intrRate: 2.7, intrRate2: 2.9 },
      ],
    });
    const selected = pickUnifiedSelectedOption(item.options, { preferredTerm: 24, rateMode: "base" });
    expect(selected.option?.intr_rate).toBe(2.7);
  });
});
