import { describe, expect, it } from "vitest";
import { noRecommendationText } from "../../../../src/lib/news/noRecommendation";
import { runStress } from "../stressRunner";

describe("v3 financeNews stressRunner", () => {
  it("high debtService + low buffer includes debt service and buffer pressure", () => {
    const result = runStress({
      profile: {
        debt: {
          hasDebt: "yes",
          rateType: "variable",
          repricingHorizon: "short",
        },
        inflation: {
          essentialExpenseShare: "high",
          rentOrMortgageShare: "medium",
          energyShare: "high",
        },
        fx: {
          foreignConsumption: "medium",
          foreignIncome: "unknown",
        },
        income: {
          incomeStability: "fragile",
        },
        liquidity: {
          monthsOfCashBuffer: "low",
        },
      },
      impact: {
        cashflowRisk: "High",
        debtServiceRisk: "High",
        inflationPressureRisk: "High",
        fxPressureRisk: "Med",
        incomeRisk: "Med",
        bufferAdequacy: "Low",
        rationale: ["조건부 관찰"],
        watch: ["kr_base_rate"],
      },
    });

    const merged = `${result.pressureAreas.join(" ")} ${result.resilienceNotes.join(" ")} ${result.monitoringOptions.join(" ")}`;
    expect(merged).toMatch(/부채/);
    expect(merged).toMatch(/완충|버퍼/);
  });

  it("all outputs pass recommendation guard", () => {
    const result = runStress({
      profile: null,
      impact: {
        cashflowRisk: "Unknown",
        debtServiceRisk: "Unknown",
        inflationPressureRisk: "Unknown",
        fxPressureRisk: "Unknown",
        incomeRisk: "Unknown",
        bufferAdequacy: "Unknown",
        rationale: [],
        watch: [],
      },
    });

    for (const line of [...result.pressureAreas, ...result.resilienceNotes, ...result.monitoringOptions]) {
      expect(noRecommendationText(line)).toBe(true);
    }
  });
});
