import { describe, expect, it } from "vitest";
import {
  buildPlanningBenefitSignals,
  buildPlanningRecommendationSignals,
  rankPlanningProductRecommendations,
  type CandidateRecommendationsPayload,
} from "../../../src/app/planning/reports/_lib/recommendationSignals";
import { type ReportVM } from "../../../src/app/planning/reports/_lib/reportViewModel";

function buildVm(input?: {
  monthlySurplusKrw?: number;
  emergencyFundMonths?: number;
  dsrPct?: number;
  goalsTable?: Array<{
    name: string;
    shortfall: number;
    targetMonth: number;
    achieved?: boolean;
  }>;
}): ReportVM {
  return {
    summaryCards: {
      ...(typeof input?.monthlySurplusKrw === "number" ? { monthlySurplusKrw: input.monthlySurplusKrw } : {}),
      ...(typeof input?.emergencyFundMonths === "number" ? { emergencyFundMonths: input.emergencyFundMonths } : {}),
      ...(typeof input?.dsrPct === "number" ? { dsrPct: input.dsrPct } : {}),
    },
    goalsTable: (input?.goalsTable ?? []).map((goal) => ({
      name: goal.name,
      targetAmount: goal.shortfall,
      currentAmount: 0,
      shortfall: goal.shortfall,
      targetMonth: goal.targetMonth,
      achieved: goal.achieved === true,
      comment: "",
    })),
  } as unknown as ReportVM;
}

function buildPayload(): CandidateRecommendationsPayload {
  return {
    runId: "run-1",
    profileId: "profile-1",
    kind: "all",
    candidates: [
      {
        id: "saving-6",
        kind: "saving",
        providerName: "테스트은행",
        productName: "비상금 적금",
        termMonths: 6,
        baseRatePct: 3.5,
        conditionsSummary: "짧은 만기",
        source: "finlife",
        fetchedAt: "2026-03-07T00:00:00.000Z",
      },
      {
        id: "deposit-24",
        kind: "deposit",
        providerName: "테스트은행",
        productName: "장기 예금",
        termMonths: 24,
        baseRatePct: 3.8,
        conditionsSummary: "긴 만기",
        source: "finlife",
        fetchedAt: "2026-03-07T00:00:00.000Z",
      },
      {
        id: "deposit-12",
        kind: "deposit",
        providerName: "테스트은행",
        productName: "목표 예금",
        termMonths: 12,
        baseRatePct: 3.6,
        conditionsSummary: "목표 만기 근접",
        source: "finlife",
        fetchedAt: "2026-03-07T00:00:00.000Z",
      },
    ],
    profileContext: {
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 2_000_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 8_000_000,
    },
    goals: [
      {
        id: "goal-1",
        name: "비상금",
        targetAmount: 12_000_000,
        currentAmount: 3_000_000,
        targetMonth: 12,
        priority: 1,
      },
    ],
    defaults: {
      amountKrw: 5_000_000,
      termMonths: 12,
      taxRatePct: 15.4,
    },
    fetchedAt: "2026-03-07T00:00:00.000Z",
  };
}

describe("planning report recommendation signals", () => {
  it("prioritizes emergency-friendly candidates when emergency fund is low", () => {
    const vm = buildVm({
      monthlySurplusKrw: 600_000,
      emergencyFundMonths: 1.5,
      goalsTable: [{ name: "비상금", shortfall: 9_000_000, targetMonth: 12 }],
    });
    const payload = buildPayload();

    const signals = buildPlanningRecommendationSignals(vm, payload);
    const ranked = rankPlanningProductRecommendations(vm, payload, 3);

    expect(signals.priority).toBe("emergency");
    expect(signals.recommendedKinds[0]).toBe("saving");
    expect(signals.preferredTermMonths[0]).toBe(6);
    expect(ranked.rows[0]?.kind).toBe("saving");
    expect(ranked.rows[0]?.appliedTermMonths).toBe(6);
  });

  it("switches to recover mode when monthly surplus is negative", () => {
    const vm = buildVm({
      monthlySurplusKrw: -150_000,
      emergencyFundMonths: 4,
      dsrPct: 42,
      goalsTable: [{ name: "생활 안정", shortfall: 3_000_000, targetMonth: 24 }],
    });
    const payload = buildPayload();

    const signals = buildPlanningRecommendationSignals(vm, payload);

    expect(signals.priority).toBe("recover");
    expect(signals.headline).toContain("현금흐름 복구");
    expect(signals.preferredTermMonths[0]).toBe(3);
    expect(signals.cautions.join(" ")).toContain("비교용");
  });

  it("derives housing benefit topics from housing-related goals", () => {
    const vm = buildVm({
      monthlySurplusKrw: 350_000,
      goalsTable: [{ name: "전세 보증금 마련", shortfall: 40_000_000, targetMonth: 24 }],
    });

    const signals = buildPlanningBenefitSignals(vm);

    expect(signals.topics).toContain("housing");
    expect(signals.topics).toContain("jeonse");
    expect(signals.headline).toContain("혜택 주제");
  });

  it("falls back to broad default benefit topics when no clear topic exists", () => {
    const vm = buildVm({
      monthlySurplusKrw: 500_000,
      goalsTable: [{ name: "여행 자금", shortfall: 2_000_000, targetMonth: 6 }],
    });

    const signals = buildPlanningBenefitSignals(vm);

    expect(signals.topics).toEqual(["housing", "job"]);
  });

  it("uses profile age and region to narrow benefit signals", () => {
    const vm = buildVm({
      monthlySurplusKrw: 500_000,
      goalsTable: [{ name: "생활 안정", shortfall: 3_000_000, targetMonth: 12 }],
    });

    const signals = buildPlanningBenefitSignals(vm, {
      birthYear: new Date().getFullYear() - 29,
      gender: "F",
      sido: "서울특별시",
      sigungu: "마포구",
    });

    expect(signals.topics).toContain("youth");
    expect(signals.query).toBe("청년");
    expect(signals.summary).toContain("서울특별시 마포구");
    expect(signals.reasons.join(" ")).toContain("기본 프로필 기준");
  });
});
