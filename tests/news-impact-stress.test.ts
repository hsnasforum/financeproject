import { describe, expect, it } from "vitest";
import { noRecommendationText } from "../src/lib/news/noRecommendation";
import { buildScenarioImpact } from "../src/lib/news/impactEngine";
import { runGradeStress } from "../src/lib/news/stressRunner";

describe("news impact + stress", () => {
  const scenario = {
    name: "Bear" as const,
    triggerStatus: "met" as const,
    observation: "금리와 환율 변동성 확대 흐름",
    triggerSummary: "pctChange(kr_usdkrw,5) > 0",
    confirmIndicators: ["kr_usdkrw", "kr_base_rate"],
    leadingIndicators: ["kr_usdkrw"],
    linkedTopics: ["rates", "fx", "inflation"],
  };

  it("returns deterministic impact for same input", () => {
    const profile = {
      debt: {
        hasDebt: true,
        rateType: "variable" as const,
        repricingHorizon: "short" as const,
      },
      inflation: {
        essentialExpenseShare: "high" as const,
        energyShare: "high" as const,
      },
      fx: {
        foreignConsumption: "high" as const,
      },
      income: {
        incomeStability: "fragile" as const,
      },
      liquidity: {
        monthsOfCashBuffer: "low" as const,
      },
    };

    const first = buildScenarioImpact({
      exposure: profile,
      scenario,
      indicatorGrades: {
        kr_usdkrw: "high",
        kr_base_rate: "up",
      },
    });
    const second = buildScenarioImpact({
      exposure: profile,
      scenario,
      indicatorGrades: {
        kr_usdkrw: "high",
        kr_base_rate: "up",
      },
    });

    expect(first).toEqual(second);
    expect(first.debtServiceRisk).toBe("High");
    expect(first.cashflowRisk).toBe("High");
    expect(first.rationale.every((line) => noRecommendationText(line))).toBe(true);
  });

  it("keeps unknown when exposure profile is missing", () => {
    const impact = buildScenarioImpact({
      exposure: null,
      scenario,
      indicatorGrades: {},
    });

    expect(impact.cashflowRisk).toBe("Unknown");
    expect(impact.bufferAdequacy).toBe("Unknown");
  });

  it("builds stress output without single numeric score and keeps safe language", () => {
    const impact = buildScenarioImpact({
      exposure: {
        debt: { hasDebt: true, rateType: "mixed", repricingHorizon: "medium" },
        inflation: { essentialExpenseShare: "medium" },
        income: { incomeStability: "moderate" },
        liquidity: { monthsOfCashBuffer: "medium" },
      },
      scenario,
      indicatorGrades: { kr_usdkrw: "up" },
    });

    const stress = runGradeStress({
      exposure: {
        debt: { hasDebt: true, rateType: "mixed", repricingHorizon: "medium" },
        liquidity: { monthsOfCashBuffer: "medium" },
      },
      impact,
      draftSummary: {
        avgNetKrw: -100000,
      },
    });

    expect(stress.pressureAreas.length).toBeGreaterThan(0);
    expect(stress.monitoringCadence.length).toBeGreaterThan(0);
    expect(stress.pressureAreas.every((line) => noRecommendationText(line))).toBe(true);
    expect(stress.resilienceNotes.every((line) => noRecommendationText(line))).toBe(true);
    expect(stress.monitoringCadence.every((line) => noRecommendationText(line))).toBe(true);
  });
});
