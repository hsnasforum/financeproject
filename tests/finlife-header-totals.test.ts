import { describe, expect, it } from "vitest";
import { deriveTotals } from "../src/lib/finlife/optionView";
import { type FinlifeSourceResult } from "../src/lib/finlife/types";

describe("finlife header totals", () => {
  it("falls back to summing options when meta.totalOptions is missing", () => {
    const payload: FinlifeSourceResult = {
      ok: true,
      mode: "live",
      meta: {
        kind: "deposit",
        pageNo: 1,
        topFinGrpNo: "020000",
        fallbackUsed: false,
        totalCount: 2,
      },
      data: [
        {
          fin_prdt_cd: "a",
          options: [{ raw: {}, save_trm: "12", intr_rate: 2.0, intr_rate2: 2.2 }],
          raw: {},
        },
        {
          fin_prdt_cd: "b",
          options: [
            { raw: {}, save_trm: "6", intr_rate: 1.8, intr_rate2: 2.0 },
            { raw: {}, save_trm: "24", intr_rate: 2.4, intr_rate2: 2.7 },
          ],
          raw: {},
        },
      ],
    };
    const totals = deriveTotals(payload, 2, 3);
    expect(totals.totalProducts).toBe(2);
    expect(totals.totalOptions).toBe(3);
    expect(totals.shownProducts).toBe(2);
    expect(totals.shownOptions).toBe(3);
  });
});

