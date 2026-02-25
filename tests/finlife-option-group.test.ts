import { describe, expect, it } from "vitest";
import { flattenOptionRows, groupOptionRowsByProduct, sortOptionRows } from "../src/lib/finlife/optionView";
import { type NormalizedProduct } from "../src/lib/finlife/types";

const products: NormalizedProduct[] = [
  {
    fin_prdt_cd: "P1",
    fin_co_no: "0010001",
    kor_co_nm: "테스트은행",
    fin_prdt_nm: "정기예금A",
    options: [
      { save_trm: "6", intr_rate: 2.1, intr_rate2: 2.2, raw: {} },
      { save_trm: "12", intr_rate: 2.4, intr_rate2: 2.8, raw: {} },
      { save_trm: "24", intr_rate: 2.5, intr_rate2: 2.6, raw: {} },
    ],
    raw: {},
  },
  {
    fin_prdt_cd: "P2",
    fin_co_no: "0010002",
    kor_co_nm: "샘플은행",
    fin_prdt_nm: "정기예금B",
    options: [{ save_trm: "12", intr_rate: 2.0, intr_rate2: 2.1, raw: {} }],
    raw: {},
  },
];

describe("finlife option grouping", () => {
  it("groups options by product code", () => {
    const rows = flattenOptionRows(products, []);
    const groups = groupOptionRowsByProduct(rows);
    const groupP1 = groups.find((group) => group.product.fin_prdt_cd === "P1");
    expect(groups.length).toBe(2);
    expect(groupP1?.rows.length).toBe(3);
  });

  it("picks representative row by best_desc", () => {
    const rows = sortOptionRows(flattenOptionRows(products, []), "term_asc");
    const groups = groupOptionRowsByProduct(rows, "best_desc");
    const groupP1 = groups.find((group) => group.product.fin_prdt_cd === "P1");
    expect(groupP1?.representativeRow.option.save_trm).toBe("12");
  });
});
