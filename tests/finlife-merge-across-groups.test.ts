import { describe, expect, it } from "vitest";
import { __test__ } from "../src/lib/finlife/syncRunner";

describe("finlife merge across groups", () => {
  it("dedupes same fin_prdt_cd across groups, keeps option merge, and preserves optionless products", () => {
    const merged = __test__.mergeProductsAcrossGroups([
      {
        topFinGrpNo: "020000",
        data: [
          {
            fin_prdt_cd: "A",
            fin_prdt_nm: "상품A",
            kor_co_nm: "은행A",
            options: [{ save_trm: "12", intr_rate: 2.3, intr_rate2: 2.6, raw: {} }],
            raw: { top_fin_grp_no: "020000" },
          },
          {
            fin_prdt_cd: "B",
            fin_prdt_nm: "상품B",
            kor_co_nm: "은행A",
            options: [],
            raw: { top_fin_grp_no: "020000" },
          },
        ],
      },
      {
        topFinGrpNo: "030200",
        data: [
          {
            fin_prdt_cd: "A",
            fin_prdt_nm: "상품A",
            kor_co_nm: "은행A",
            options: [{ save_trm: "24", intr_rate: 2.4, intr_rate2: 2.8, raw: {} }],
            raw: { top_fin_grp_no: "030200" },
          },
        ],
      },
    ]);

    const productA = merged.items.find((item) => item.fin_prdt_cd === "A");
    const productB = merged.items.find((item) => item.fin_prdt_cd === "B");

    expect(merged.items.length).toBe(2);
    expect(merged.duplicateAcrossGroupsCount).toBe(1);
    expect(productA?.options.length).toBe(2);
    expect(productB?.options.length).toBe(0);
  });
});
