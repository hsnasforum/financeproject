import { describe, expect, it } from "vitest";
import { applyFilters, deriveTags } from "../src/lib/finlife/filters";
import { type NormalizedProduct } from "../src/lib/finlife/types";

function makeProduct(code: string, term: string, name = "상품", extraRaw?: Record<string, unknown>): NormalizedProduct {
  return {
    fin_prdt_cd: code,
    fin_prdt_nm: name,
    kor_co_nm: "테스트은행",
    options: [
      {
        save_trm: term,
        intr_rate: 2.5,
        intr_rate2: 3.1,
        raw: { save_trm: term, intr_rate_type_nm: "단리" },
      },
    ],
    raw: {
      join_way: "모바일 가입",
      spcl_cnd: "급여이체 우대",
      ...extraRaw,
    },
  };
}

describe("finlife filters", () => {
  it("filters products by term", () => {
    const products = [makeProduct("A", "12"), makeProduct("B", "24")];
    const filtered = applyFilters(
      products,
      {
        selectedTerms: ["24"],
        amountWon: 0,
        selectedProductTypes: [],
        selectedBenefits: [],
      },
      "deposit",
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].fin_prdt_cd).toBe("B");
  });

  it("derives keyword-based tags", () => {
    const tags = deriveTags(makeProduct("A", "12", "특판 적금", { join_deny: "2", etc_note: "카드 실적 + 자동이체" }), "saving");
    expect(tags.productTypes).toContain("서민전용");
    expect(tags.productTypes).toContain("특판");
    expect(tags.benefits).toContain("카드실적");
    expect(tags.benefits).toContain("자동이체");
  });
});
