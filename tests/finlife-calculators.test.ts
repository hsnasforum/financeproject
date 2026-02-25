import { describe, expect, it } from "vitest";
import { calcDeposit } from "../src/lib/finlife/calculators";

describe("finlife calculators", () => {
  it("calculates deposit after-tax maturity with simple interest", () => {
    const result = calcDeposit({
      principalWon: 10_000_000,
      months: 12,
      annualRatePct: 3.25,
      taxRatePct: 15.4,
      interestType: "simple",
    });

    expect(result.grossInterestWon).toBe(325_000);
    expect(result.taxWon).toBe(50_050);
    expect(result.netInterestWon).toBe(274_950);
    expect(result.maturityWon).toBe(10_274_950);
  });
});
