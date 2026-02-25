import { describe, expect, it } from "vitest";
import { summarizeProductHighlights } from "../src/lib/finlife/highlights";
import { type NormalizedProduct } from "../src/lib/finlife/types";

describe("summarizeProductHighlights", () => {
  it("extracts join target and complexity from raw fields", () => {
    const product: NormalizedProduct = {
      fin_prdt_cd: "D1",
      fin_prdt_nm: "테스트예금",
      kor_co_nm: "테스트은행",
      options: [
        {
          save_trm: "12",
          intr_rate: 2.1,
          intr_rate2: 3.0,
          raw: { spcl_cnd: "급여이체 실적 필요, 카드 사용 실적 필요" },
        },
      ],
      raw: {
        join_member: "개인고객",
        etc_note: "우대조건 충족을 위해 증빙 제출 필요",
      },
    };

    const highlights = summarizeProductHighlights(product);
    expect(highlights.joinTargetLabel).toContain("대상");
    expect(highlights.conditionsComplexity === "보통" || highlights.conditionsComplexity === "복잡").toBe(true);
  });
});
