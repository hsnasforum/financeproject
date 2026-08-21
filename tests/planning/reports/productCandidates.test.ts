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

  it("does not cross-fallback between explicitly requested rate bases", () => {
    expect(pickRateFromOption({ intr_rate: 2.8, intr_rate2: null }, true)).toBeNull();
    expect(pickRateFromOption({ intr_rate: null, intr_rate2: 3.4 }, false)).toBeNull();
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
            raw: { intr_rate_type_nm: "단리" },
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
    expect(row.selectedOption).toBe(products[0].options[0]);
    expect(row.netInterestWon).toBe(expected.netInterestWon);
    expect(row.maturityWon).toBe(expected.maturityWon);
  });

  it("keeps the preferred actual option and excludes missing calculation inputs", () => {
    const valid: NormalizedProduct = {
      fin_prdt_cd: "p-options",
      options: [
        { save_trm: "6", intr_rate: 2.5, intr_rate2: 2.8, raw: { intr_rate_type_nm: "단리" } },
        { save_trm: "24", intr_rate: 3.2, intr_rate2: 3.6, raw: { intr_rate_type_nm: "단리" } },
      ],
      best: { save_trm: "6", intr_rate: 2.5, intr_rate2: 2.8 },
      raw: {},
    };
    const missingRate: NormalizedProduct = {
      fin_prdt_cd: "p-missing-rate",
      options: [{ save_trm: "24", intr_rate: null, intr_rate2: null, raw: { intr_rate_type_nm: "단리" } }],
      raw: {},
    };
    const missingTerm: NormalizedProduct = {
      fin_prdt_cd: "p-missing-term",
      options: [{ intr_rate: 3, intr_rate2: 3.4, raw: { intr_rate_type_nm: "단리" } }],
      raw: {},
    };

    const rows = buildProductCandidateRows("deposit", [valid, missingRate, missingTerm], { termMonths: 24 });

    expect(rows).toHaveLength(1);
    expect(rows[0].selectedOption).toBe(valid.options[1]);
    expect(rows[0]).toMatchObject({ termMonths: 24, annualRatePct: 3.6 });
  });

  it("uses a calculable option when an earlier option for the same term has no rate", () => {
    const product: NormalizedProduct = {
      fin_prdt_cd: "p-same-term-rate-gap",
      options: [
        { save_trm: "12", intr_rate: null, intr_rate2: null, raw: { intr_rate_type_nm: "단리" } },
        { save_trm: "12", intr_rate: 3.1, intr_rate2: 3.5, raw: { intr_rate_type_nm: "복리" } },
      ],
      raw: {},
    };

    const rows = buildProductCandidateRows("deposit", [product], { termMonths: 12, usePrimeRate: true });

    expect(rows).toHaveLength(1);
    expect(rows[0].selectedOption).toBe(product.options[1]);
    expect(rows[0]).toMatchObject({ termMonths: 12, annualRatePct: 3.5 });
  });

  it("uses the disclosed interest method and excludes unknown methods", () => {
    const compound: NormalizedProduct = {
      fin_prdt_cd: "p-compound",
      options: [{ save_trm: "24", intr_rate: 5, intr_rate2: 5, raw: { intr_rate_type_nm: "복리" } }],
      raw: {},
    };
    const unknown: NormalizedProduct = {
      fin_prdt_cd: "p-unknown-interest",
      options: [{ save_trm: "24", intr_rate: 9, intr_rate2: 9, raw: { intr_rate_type_nm: "혼합" } }],
      raw: {},
    };
    const rows = buildProductCandidateRows("deposit", [compound, unknown], {
      termMonths: 24,
      usePrimeRate: false,
      depositPrincipalWon: 10_000_000,
      taxRatePct: 15.4,
    });
    const expected = calcDeposit({
      principalWon: 10_000_000,
      months: 24,
      annualRatePct: 5,
      taxRatePct: 15.4,
      interestType: "compound",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].product.fin_prdt_cd).toBe("p-compound");
    expect(rows[0].maturityWon).toBe(expected.maturityWon);
  });

  it.each(["6~12개월", "1년이상~3년이하"])("excludes ambiguous term %s", (saveTrm) => {
    const rows = buildProductCandidateRows("deposit", [{
      fin_prdt_cd: `p-${saveTrm}`,
      options: [{ save_trm: saveTrm, intr_rate: 3, intr_rate2: 3.4, raw: { intr_rate_type_nm: "단리" } }],
      raw: {},
    }], { termMonths: 12 });

    expect(rows).toEqual([]);
  });
});
