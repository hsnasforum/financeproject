import { describe, expect, it } from "vitest";
import {
  buildReportModel,
  toJson,
  toMarkdown,
  type PlannerLastSnapshot,
} from "../src/lib/report/reportBuilder";
import type { SavedRecommendRun } from "../src/lib/recommend/savedRunsStore";

function sampleRun(): SavedRecommendRun {
  return {
    runId: "run_20260225_demo",
    savedAt: "2026-02-25T10:00:00.000Z",
    profile: {
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 5,
      candidatePool: "unified",
      candidateSources: ["finlife"],
      depositProtection: "any",
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
    },
    items: [
      {
        unifiedId: "finlife:P-001",
        providerName: "테스트은행",
        productName: "테스트예금",
        kind: "deposit",
        termMonths: 12,
        appliedRate: 3.4,
        rank: 1,
        finalScore: 0.9123,
      },
    ],
  };
}

function samplePlannerSnapshot(): PlannerLastSnapshot {
  return {
    savedAt: "2026-02-25T09:59:00.000Z",
    input: {
      monthlyIncomeNet: 4000000,
      monthlyFixedExpenses: 1200000,
      monthlyVariableExpenses: 800000,
      liquidAssets: 3000000,
      otherAssets: 0,
      debts: [],
      goals: [{ name: "목표", targetAmount: 10000000, horizonMonths: 24 }],
    },
    result: {
      metrics: [{ key: "free", label: "월 가용저축액", value: 2000000, unit: "KRW", formula: "income-expense" }],
      actions: [{ priority: "high", title: "비상금", action: "비상금 적립", reason: "유동성" }],
      emergencyPlan: {
        targetAmount: 6000000,
        current: 3000000,
        gap: 3000000,
        suggestedMonthly: 1000000,
        estimatedMonths: 3,
        note: "테스트",
      },
      debtPlan: {
        highInterestDebts: [],
        focusDebt: undefined,
        extraPaymentMonthly: 0,
        estimatedPayoffMonths: null,
        note: "테스트",
      },
      goalPlans: [],
      warnings: [],
      assumptionsUsed: {
        emergencyTargetMonths: 3,
        minEmergencyMonthsBeforeDebtExtra: 1,
        highInterestAprPctThreshold: 10,
        dsrWarnPct: 40,
        annualReturnPct: 0,
        applyReturnToSimulation: false,
        maxSimMonths: 600,
      },
      explain: { notes: ["테스트"] },
    },
  };
}

describe("report builder", () => {
  it("builds model and markdown with planner + recommendation sections", () => {
    const model = buildReportModel({
      plannerSnapshot: samplePlannerSnapshot(),
      savedRun: sampleRun(),
      generatedAt: "2026-02-25T10:10:00.000Z",
    });
    const markdown = toMarkdown(model);
    const json = toJson(model);

    expect(model.overview.runId).toBe("run_20260225_demo");
    expect(model.planner.available).toBe(true);
    expect(model.recommendation.available).toBe(true);
    expect(markdown).toContain("## 플래너 요약");
    expect(markdown).toContain("## 추천 요약");
    expect(markdown).toContain("테스트예금");
    expect(json).toContain("\"runId\": \"run_20260225_demo\"");
  });

  it("falls back to 안내 문구 when planner snapshot is missing", () => {
    const model = buildReportModel({
      plannerSnapshot: null,
      savedRun: sampleRun(),
      generatedAt: "2026-02-25T10:10:00.000Z",
    });
    const markdown = toMarkdown(model);

    expect(model.planner.available).toBe(false);
    expect(markdown).toContain("플래너 스냅샷이 없어");
  });
});
