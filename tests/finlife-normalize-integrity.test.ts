import { describe, expect, it } from "vitest";
import { normalizeFinlifeProducts } from "../src/lib/finlife/normalize";

describe("FINLIFE product and option identity", () => {
  it("keeps same-code companies separate and joins only the exact disclosure", () => {
    const products = normalizeFinlifeProducts({
      baseList: [
        { fin_co_no: "1234", fin_prdt_cd: "SAME", dcls_month: "202609", kor_co_nm: "은행 A" },
        { fin_co_no: "7654", fin_prdt_cd: "SAME", dcls_month: "202609", kor_co_nm: "은행 B" },
      ],
      optionList: [
        { fin_co_no: "0001234", fin_prdt_cd: "SAME", dcls_month: "202609", intr_rate: "2.1", save_trm: "12" },
        { fin_co_no: "7654", fin_prdt_cd: "SAME", dcls_month: "202609", intr_rate: "3.1", save_trm: "12" },
      ],
    });

    expect(products).toHaveLength(2);
    expect(products.map((product) => [product.fin_co_no, product.options.map((option) => option.intr_rate)])).toEqual([
      ["0001234", [2.1]],
      ["0007654", [3.1]],
    ]);
  });

  it("keeps credit subtypes separate under the same company and product code", () => {
    const products = normalizeFinlifeProducts({
      baseList: [
        { fin_co_no: "1234", fin_prdt_cd: "CREDIT", dcls_month: "202609", crdt_prdt_type: "1" },
        { fin_co_no: "1234", fin_prdt_cd: "CREDIT", dcls_month: "202609", crdt_prdt_type: "2" },
      ],
      optionList: [
        { fin_co_no: "1234", fin_prdt_cd: "CREDIT", dcls_month: "202609", crdt_prdt_type: "1", crdt_lend_rate_type: "A", crdt_grad_avg: "4.1" },
        { fin_co_no: "1234", fin_prdt_cd: "CREDIT", dcls_month: "202609", crdt_prdt_type: "2", crdt_lend_rate_type: "A", crdt_grad_avg: "5.1" },
      ],
    });

    expect(products).toHaveLength(2);
    expect(products.map((product) => [product.raw.crdt_prdt_type, product.options.map((option) => option.raw.crdt_grad_avg)])).toEqual([
      ["1", ["4.1"]],
      ["2", ["5.1"]],
    ]);
  });

  it.each([
    { fin_co_no: "1234", fin_prdt_cd: "SAME", dcls_month: "202608" },
    { fin_prdt_cd: "SAME", dcls_month: "202609" },
    { fin_co_no: "1234", fin_prdt_cd: "SAME", dcls_month: "202609", crdt_prdt_type: "2" },
  ])("rejects an orphan option instead of borrowing a different identity: %j", (option) => {
    expect(() => normalizeFinlifeProducts({
      baseList: [{ fin_co_no: "1234", fin_prdt_cd: "SAME", dcls_month: "202609" }],
      optionList: [option],
    })).toThrow(/orphan/i);
  });

  it("keeps only the latest disclosure without borrowing old options", () => {
    const products = normalizeFinlifeProducts({
      baseList: [
        { fin_co_no: "1234", fin_prdt_cd: "MONTHLY", dcls_month: "202609" },
        { fin_co_no: "1234", fin_prdt_cd: "MONTHLY", dcls_month: "202608" },
      ],
      optionList: [
        { fin_co_no: "1234", fin_prdt_cd: "MONTHLY", dcls_month: "202608", intr_rate: "9.1", save_trm: "12" },
      ],
    });

    expect(products).toHaveLength(1);
    expect(products[0]?.raw.dcls_month).toBe("202609");
    expect(products[0]?.options).toHaveLength(0);
    expect(products[0]?.best).toBeUndefined();
  });
});
