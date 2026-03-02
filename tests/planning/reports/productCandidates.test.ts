import { describe, expect, it } from "vitest";
import { calcDeposit } from "../../../src/lib/planning/calc";
import { buildProductCandidateRows, pickRateFromOption } from "../../../src/lib/planning/reports/productCandidates";
import { type NormalizedProduct } from "../../../src/lib/finlife/types";

describe("pickRateFromOption", () => {
  it("prefers intr_rate2 when usePrimeRate=true", () => {
    expect(
      pickRateFromOption(
        {
          intr_rate: 2.8,
          intr_rate2: 3.4,
        },
        true,
      ),
    ).toBe(3.4);
  });

  it("uses intr_rate first when usePrimeRate=false", () => {
    expect(
      pickRateFromOption(
        {
          intr_rate: 2.8,
          intr_rate2: 3.4,
        },
        false,
      ),
    ).toBe(2.8);
  });
});

describe("buildProductCandidateRows", () => {
  it("matches deposit calculator net/maturity output for a fixed option", () => {
    const products: NormalizedProduct[] = [
      {
        fin_prdt_cd: "p-fixed",
        kor_co_nm: "테스트은행",
        fin_prdt_nm: "테스트 예금",
        options: [
          {
            save_trm: "12",
            intr_rate: 3.25,
            intr_rate2: 3.75,
            raw: {},
          },
        ],
        raw: {},
      },
    ];

    const rows = buildProductCandidateRows("deposit", products, {
      termMonths: 12,
      usePrimeRate: false,
      taxRatePct: 15.4,
      depositPrincipalWon: 10_000_000,
      savingMonthlyPaymentWon: 500_000,
      sortKey: "maturityDesc",
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    const expected = calcDeposit({
      principalWon: 10_000_000,
      months: 12,
      annualRatePct: 3.25,
      taxRatePct: 15.4,
      interestType: "simple",
    });

    expect(row.annualRatePct).toBe(3.25);
    expect(row.netInterestWon).toBe(expected.netInterestWon);
    expect(row.maturityWon).toBe(expected.maturityWon);
  });
});
