import { describe, expect, it } from "vitest";
import { normalizeFinlifeProducts } from "../src/lib/finlife/normalize";

describe("normalizeFinlifeProducts", () => {
  it("merges baseList and optionList by fin_prdt_cd", () => {
    const rows = normalizeFinlifeProducts({
      baseList: [{ fin_prdt_cd: "A", kor_co_nm: "은행", fin_prdt_nm: "상품A" }],
      optionList: [
        { fin_prdt_cd: "A", save_trm: "6", intr_rate: "2.0", intr_rate2: "2.3" },
        { fin_prdt_cd: "A", save_trm: "12", intr_rate: "2.5", intr_rate2: "2.7" },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].options).toHaveLength(2);
    expect(rows[0].best?.intr_rate2).toBe(2.7);
  });

  it("does not compute best when options do not have rate fields", () => {
    const rows = normalizeFinlifeProducts({
      baseList: [{ fin_prdt_cd: "L1", kor_co_nm: "은행", fin_prdt_nm: "대출A" }],
      optionList: [
        { fin_prdt_cd: "L1", save_trm: "12", ln_lmt: "10000000" },
        { fin_prdt_cd: "L1", save_trm: "24", ln_lmt: "20000000" },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].options).toHaveLength(2);
    expect(rows[0].best).toBeUndefined();
  });
});
