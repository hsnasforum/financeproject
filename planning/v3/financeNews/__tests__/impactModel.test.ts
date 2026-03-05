import { describe, expect, it } from "vitest";
import { noRecommendationText } from "../../../../src/lib/news/noRecommendation";
import { computeImpact } from "../impactModel";

describe("v3 financeNews impactModel", () => {
  it("variable rate + rates scenario raises debtServiceRisk", () => {
    const result = computeImpact({
      profile: {
        debt: {
          hasDebt: "yes",
          rateType: "variable",
          repricingHorizon: "short",
        },
        inflation: {
          essentialExpenseShare: "unknown",
          rentOrMortgageShare: "unknown",
          energyShare: "unknown",
        },
        fx: {
          foreignConsumption: "unknown",
          foreignIncome: "unknown",
        },
        income: {
          incomeStability: "moderate",
        },
        liquidity: {
          monthsOfCashBuffer: "medium",
        },
      },
      scenario: {
        name: "Bear",
        triggerStatus: "met",
        linkedTopics: ["rates"],
        confirmIndicators: ["kr_base_rate"],
        leadingIndicators: [],
      },
      indicatorGrades: {
        kr_base_rate: "high",
      },
    });

    expect(["Med", "High"]).toContain(result.debtServiceRisk);
  });

  it("high essentials + inflation scenario raises inflationPressureRisk", () => {
    const result = computeImpact({
      profile: {
        debt: {
          hasDebt: "unknown",
          rateType: "unknown",
          repricingHorizon: "unknown",
        },
        inflation: {
          essentialExpenseShare: "high",
          rentOrMortgageShare: "medium",
          energyShare: "high",
        },
        fx: {
          foreignConsumption: "unknown",
          foreignIncome: "unknown",
        },
        income: {
          incomeStability: "stable",
        },
        liquidity: {
          monthsOfCashBuffer: "low",
        },
      },
      scenario: {
        name: "Base",
        triggerStatus: "met",
        linkedTopics: ["inflation", "commodities"],
        confirmIndicators: ["kr_cpi"],
        leadingIndicators: [],
      },
      indicatorGrades: {
        kr_cpi: "high",
      },
    });

    expect(["Med", "High"]).toContain(result.inflationPressureRisk);
  });

  it("missing profile returns all Unknown", () => {
    const result = computeImpact({
      profile: null,
      scenario: {
        name: "Base",
        triggerStatus: "unknown",
        linkedTopics: [],
        confirmIndicators: [],
        leadingIndicators: [],
      },
      indicatorGrades: {},
    });

    expect(result.cashflowRisk).toBe("Unknown");
    expect(result.debtServiceRisk).toBe("Unknown");
    expect(result.inflationPressureRisk).toBe("Unknown");
    expect(result.fxPressureRisk).toBe("Unknown");
    expect(result.incomeRisk).toBe("Unknown");
    expect(result.bufferAdequacy).toBe("Unknown");
  });

  it("rationale is recommendation-safe", () => {
    const result = computeImpact({
      profile: null,
      scenario: {
        name: "Base",
        triggerStatus: "unknown",
        linkedTopics: [],
        confirmIndicators: [],
        leadingIndicators: [],
      },
    });

    expect(result.rationale.every((line) => noRecommendationText(line))).toBe(true);
  });
});
