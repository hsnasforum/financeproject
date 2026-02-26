import { describe, expect, it } from "vitest";
import { depositToMonthly, housingBurden, monthlyMortgagePayment } from "../src/lib/housing/afford";
import { parseAffordInit } from "../src/lib/housing/affordQuery";

describe("housing afford calculators", () => {
  it("returns principal/term for zero-rate mortgage", () => {
    expect(monthlyMortgagePayment(120_000_000, 0, 240)).toBeCloseTo(500_000, 6);
  });

  it("returns zero for invalid mortgage inputs", () => {
    expect(monthlyMortgagePayment(-1, 4.2, 360)).toBe(0);
    expect(monthlyMortgagePayment(100_000_000, 4.2, 0)).toBe(0);
  });

  it("converts deposit opportunity cost to monthly amount", () => {
    expect(depositToMonthly(100_000_000, 3)).toBeCloseTo(250_000, 6);
    expect(depositToMonthly(-100_000_000, 3)).toBe(0);
  });

  it("computes rent-mode burden and residual cashflow", () => {
    const result = housingBurden({
      incomeNetMonthly: 4_000_000,
      nonHousingOutflowMonthly: 1_500_000,
      mode: "rent",
      rent: { deposit: 100_000_000, monthlyRent: 700_000, opportunityAprPct: 3 },
    });

    expect(result.monthlyHousingCost).toBeCloseTo(950_000, 6);
    expect(result.housingRatioPct).toBeCloseTo(23.75, 6);
    expect(result.residualCashFlow).toBeCloseTo(1_550_000, 6);
  });

  it("adds warnings for high burden and negative residual in buy mode", () => {
    const result = housingBurden({
      incomeNetMonthly: 2_000_000,
      nonHousingOutflowMonthly: 1_000_000,
      mode: "buy",
      buy: { purchasePrice: 400_000_000, equity: 40_000_000, loanAprPct: 5, termMonths: 120 },
    });

    expect(result.breakdown.principal).toBe(360_000_000);
    expect(result.monthlyHousingCost).toBeGreaterThan(3_000_000);
    expect(result.warnings.join(" ")).toContain("40%");
    expect(result.warnings.join(" ")).toContain("잔여현금흐름");
  });
});

describe("parseAffordInit", () => {
  it("uses sane defaults when params are missing", () => {
    const parsed = parseAffordInit(undefined);
    expect(parsed).toEqual({
      incomeNet: 3_500_000,
      outflow: 1_800_000,
      mode: "rent",
      deposit: 100_000_000,
      monthlyRent: 700_000,
      opportunityAprPct: 3,
      purchasePrice: 500_000_000,
      equity: 150_000_000,
      loanAprPct: 4.2,
      termMonths: 360,
    });
  });

  it("parses query parameters", () => {
    const parsed = parseAffordInit(new URLSearchParams("incomeNet=4200000&outflow=1900000&mode=buy&purchasePrice=600000000&equity=200000000&loanAprPct=4.5&termMonths=300"));
    expect(parsed.incomeNet).toBe(4_200_000);
    expect(parsed.outflow).toBe(1_900_000);
    expect(parsed.mode).toBe("buy");
    expect(parsed.purchasePrice).toBe(600_000_000);
    expect(parsed.equity).toBe(200_000_000);
    expect(parsed.loanAprPct).toBe(4.5);
    expect(parsed.termMonths).toBe(300);
  });

  it("sanitizes invalid values and clamps ranges", () => {
    const parsed = parseAffordInit(
      new URLSearchParams("incomeNet=-1&outflow=-2&mode=invalid&loanAprPct=99&opportunityAprPct=-3&termMonths=1"),
    );
    expect(parsed.incomeNet).toBe(0);
    expect(parsed.outflow).toBe(0);
    expect(parsed.mode).toBe("rent");
    expect(parsed.loanAprPct).toBe(30);
    expect(parsed.opportunityAprPct).toBe(0);
    expect(parsed.termMonths).toBe(12);
  });

  it("supports object-style search params", () => {
    const parsed = parseAffordInit({
      incomeNet: "5_000_000",
      mode: "buy",
      termMonths: ["480"],
    });
    expect(parsed.incomeNet).toBe(3_500_000);
    expect(parsed.mode).toBe("buy");
    expect(parsed.termMonths).toBe(480);
  });
});
