import { describe, expect, it } from "vitest";
import { flattenOptionRows } from "../src/lib/finlife/optionView";
import { type NormalizedProduct } from "../src/lib/finlife/types";

function makeProduct(): NormalizedProduct {
  return {
    fin_prdt_cd: "prd-1",
    fin_co_no: "0010001",
    kor_co_nm: "테스트은행",
    fin_prdt_nm: "테스트예금",
    options: [
      { save_trm: "6", intr_rate: 2.1, intr_rate2: 2.3, raw: {} },
      { save_trm: "12", intr_rate: 2.5, intr_rate2: 2.8, raw: {} },
      { save_trm: "24", intr_rate: 2.7, intr_rate2: 3.0, raw: {} },
    ],
    raw: {},
  };
}

describe("finlife option view", () => {
  it("flattens product options into option rows", () => {
    const rows = flattenOptionRows([makeProduct()], []);
    expect(rows.length).toBe(3);
    expect(rows.map((row) => row.option.save_trm)).toEqual(["6", "12", "24"]);
  });

  it("keeps only selected term options", () => {
    const rows = flattenOptionRows([makeProduct()], ["12"]);
    expect(rows.length).toBe(1);
    expect(rows[0]?.option.save_trm).toBe("12");
  });
});

