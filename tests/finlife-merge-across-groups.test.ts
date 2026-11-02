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
            options: [{ save_trm: "12", intr_rate: 2.3, intr_rate2: 2.6, raw: { save_trm: "12", intr_rate: 2.3, intr_rate2: 2.6 } }],
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
            options: [{ save_trm: "24", intr_rate: 2.4, intr_rate2: 2.8, raw: { save_trm: "24", intr_rate: 2.4, intr_rate2: 2.8 } }],
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

  it("keeps companies separate and retains equal-rate options with different dimensions", () => {
    const raw = { fin_co_no: "0001234", fin_prdt_cd: "SAME", dcls_month: "202609" };
    const first = { save_trm: "12", intr_rate: 2.3, intr_rate2: 2.6, raw: { ...raw, intr_rate_type: "S", save_trm: "12" } };
    const second = { ...first, raw: { ...raw, intr_rate_type: "M", save_trm: "12" } };
    const merged = __test__.mergeProductsAcrossGroups([
      { topFinGrpNo: "020000", data: [{ fin_prdt_cd: "SAME", fin_co_no: "0001234", raw, options: [first] }] },
      { topFinGrpNo: "030200", data: [
        { fin_prdt_cd: "SAME", fin_co_no: "0001234", raw, options: [second, first] },
        { fin_prdt_cd: "SAME", fin_co_no: "0007654", raw: { ...raw, fin_co_no: "0007654" }, options: [] },
      ] },
    ]);

    expect(merged.items).toHaveLength(2);
    expect(merged.duplicateAcrossGroupsCount).toBe(1);
    expect(merged.items.find((item) => item.fin_co_no === "0001234")?.options).toHaveLength(2);
    expect(merged.items.find((item) => item.fin_co_no === "0007654")?.options).toHaveLength(0);
  });

  it("does not union older disclosure options into the latest product", () => {
    const raw = { fin_co_no: "0001234", fin_prdt_cd: "MONTHLY", dcls_month: "202609" };
    const merged = __test__.mergeProductsAcrossGroups([
      { topFinGrpNo: "020000", data: [{ fin_prdt_cd: "MONTHLY", fin_co_no: "0001234", raw, options: [] }] },
      { topFinGrpNo: "030200", data: [{ fin_prdt_cd: "MONTHLY", fin_co_no: "0001234", raw: { ...raw, dcls_month: "202608" }, options: [{ save_trm: "12", intr_rate: 9.1, raw: { ...raw, dcls_month: "202608", save_trm: "12" } }] }] },
    ]);

    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.raw.dcls_month).toBe("202609");
    expect(merged.items[0]?.options).toHaveLength(0);
  });
});
