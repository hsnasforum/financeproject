import { describe, expect, it } from "vitest";
import { __test__ as sourceTest } from "../src/lib/finlife/source";
import { type FinlifeSourceResult } from "../src/lib/finlife/types";

function page(data: FinlifeSourceResult["data"], pageNo: number, hasNext: boolean): FinlifeSourceResult {
  return {
    ok: true,
    mode: "mock",
    meta: {
      kind: "deposit",
      pageNo,
      topFinGrpNo: "020000",
      fallbackUsed: false,
      hasNext,
      nextPage: hasNext ? pageNo + 1 : null,
    },
    data,
  };
}

describe("finlife scan-all merge", () => {
  it("keeps products without options and aggregates pages", () => {
    const pages: FinlifeSourceResult[] = [
      page([
        { fin_prdt_cd: "A", fin_prdt_nm: "상품A", kor_co_nm: "은행", options: [{ raw: {}, intr_rate: 2.5, intr_rate2: 3.1, save_trm: "12" }], raw: {} },
      ], 1, true),
      page([
        { fin_prdt_cd: "B", fin_prdt_nm: "상품B", kor_co_nm: "은행", options: [], raw: {} },
      ], 2, false),
    ];

    const payload = sourceTest.buildScanAllPayload({
      kind: "deposit",
      topFinGrpNo: "020000",
      mode: "mock",
      pageResults: pages,
      truncatedByMaxPages: false,
    });

    expect(payload.meta.pagesFetched).toBe(2);
    expect(payload.meta.totalProducts).toBe(2);
    expect(payload.meta.optionsMissingCount).toBe(1);
    expect(payload.data.find((row) => row.fin_prdt_cd === "B")?.options.length).toBe(0);
  });

  it("preserves company boundaries while selecting each latest disclosure", () => {
    const raw = { fin_co_no: "0001234", fin_prdt_cd: "SAME", dcls_month: "202609" };
    const pages = [
      page([{ fin_prdt_cd: "SAME", fin_co_no: "0001234", options: [], raw }], 1, true),
      page([
        { fin_prdt_cd: "SAME", fin_co_no: "0007654", options: [], raw: { ...raw, fin_co_no: "0007654" } },
        { fin_prdt_cd: "SAME", fin_co_no: "0001234", options: [{ intr_rate: 9.1, raw: { ...raw, dcls_month: "202608" } }], raw: { ...raw, dcls_month: "202608" } },
      ], 2, false),
    ];
    const payload = sourceTest.buildScanAllPayload({ kind: "deposit", topFinGrpNo: "020000", mode: "mock", pageResults: pages, truncatedByMaxPages: false });

    expect(payload.meta.totalProducts).toBe(2);
    expect(payload.meta.totalOptions).toBe(0);
    expect(payload.data.find((row) => row.fin_co_no === "0001234")?.raw.dcls_month).toBe("202609");
  });
});
