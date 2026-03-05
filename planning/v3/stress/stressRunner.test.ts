import { describe, expect, it } from "vitest";
import { noRecommendationText } from "../../../src/lib/news/noRecommendation";
import { runGradeStress } from "./stressRunner";

describe("planning v3 stress runner", () => {
  it("includes debt and buffer pressure when debt risk is high and buffer is low", () => {
    const result = runGradeStress({
      profile: {
        debt: {
          hasDebt: "yes",
          rateType: "variable",
          repricingHorizon: "short",
        },
        inflation: {
          essentialExpenseShare: "medium",
          rentOrMortgageShare: "medium",
          energyShare: "medium",
        },
        fx: {
          foreignConsumption: "medium",
          foreignIncome: "unknown",
        },
        income: {
          incomeStability: "moderate",
        },
        liquidity: {
          monthsOfCashBuffer: "low",
        },
      },
      impact: {
        cashflowRisk: "High",
        debtServiceRisk: "High",
        inflationPressureRisk: "Med",
        fxPressureRisk: "Low",
        incomeRisk: "Med",
        bufferAdequacy: "Low",
        rationale: ["조건부 관찰"],
        watch: ["kr_base_rate"],
      },
      draftSummary: null,
    });

    const merged = [
      ...result.pressureAreas,
      ...result.resilienceNotes,
      ...result.monitoringOptions,
    ].join(" ");

    expect(merged).toMatch(/부채/);
    expect(merged).toMatch(/완충|버퍼/);
  });

  it("keeps all strings recommendation-safe", () => {
    const result = runGradeStress({
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

    const lines = [
      ...result.pressureAreas,
      ...result.resilienceNotes,
      ...result.monitoringOptions,
    ];
    for (const line of lines) {
      expect(noRecommendationText(line)).toBe(true);
    }
  });
});

