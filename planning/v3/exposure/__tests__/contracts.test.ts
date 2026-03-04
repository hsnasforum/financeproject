import { describe, expect, it } from "vitest";
import { parseExposureProfileInput } from "../contracts";

describe("planning v3 exposure contracts", () => {
  it("accepts valid enum payload", () => {
    const parsed = parseExposureProfileInput({
      debt: {
        hasDebt: "yes",
        rateType: "variable",
        repricingHorizon: "short",
      },
      inflation: {
        essentialExpenseShare: "high",
        rentOrMortgageShare: "medium",
        energyShare: "low",
      },
      fx: {
        foreignConsumption: "high",
        foreignIncome: "unknown",
      },
      income: {
        incomeStability: "fragile",
      },
      liquidity: {
        monthsOfCashBuffer: "low",
      },
    });

    expect(parsed.debt.hasDebt).toBe("yes");
    expect(parsed.fx.foreignIncome).toBe("unknown");
  });

  it("fails on invalid enum", () => {
    expect(() => parseExposureProfileInput({
      debt: {
        hasDebt: "yes",
        rateType: "floating",
        repricingHorizon: "short",
      },
    })).toThrow();
  });
});
