import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import { mergeProducts, mergeAcrossGroups } from "../scripts/finlife_cli_common.mjs";

describe("finlife CLI best derivation", () => {
  it("mergeProducts derives best from options", () => {
    const base = [{ fin_prdt_cd: "P1", fin_co_no: "001", kor_co_nm: "X", fin_prdt_nm: "Y" }];
    const opts = [
      { fin_prdt_cd: "P1", save_trm: "6", intr_rate: "2.85", intr_rate2: "3.05" },
      { fin_prdt_cd: "P1", save_trm: "12", intr_rate: "2.95", intr_rate2: "3.25" },
    ];
    const out = mergeProducts(base, opts, "020000");
    expect(out[0].best.save_trm).toBe("12");
    expect(out[0].best.intr_rate).toBe(2.95);
    expect(out[0].best.intr_rate2).toBe(3.25);
  });

  it("mergeAcrossGroups recomputes best after option union", () => {
    const base = [{ fin_prdt_cd: "P1", fin_co_no: "001", kor_co_nm: "X", fin_prdt_nm: "Y" }];
    const a = mergeProducts(base, [{ fin_prdt_cd: "P1", save_trm: "12", intr_rate: "2.0", intr_rate2: "2.2" }], "010000");
    const b = mergeProducts(base, [{ fin_prdt_cd: "P1", save_trm: "12", intr_rate: "2.5", intr_rate2: "3.1" }], "020000");

    const merged = mergeAcrossGroups([
      { group: "010000", items: a, totalCount: 1 },
      { group: "020000", items: b, totalCount: 1 },
    ]);

    expect(merged.items[0].best.intr_rate2).toBe(3.1);
  });

  it("intr_rate2 missing is backfilled from intr_rate", () => {
    const base = [{ fin_prdt_cd: "P1", fin_co_no: "001", kor_co_nm: "X", fin_prdt_nm: "Y" }];
    const out = mergeProducts(base, [{ fin_prdt_cd: "P1", save_trm: "12", intr_rate: "2.10", intr_rate2: "" }], "020000");
    expect(out[0].best.intr_rate).toBe(2.1);
    expect(out[0].best.intr_rate2).toBe(2.1);
  });
});
