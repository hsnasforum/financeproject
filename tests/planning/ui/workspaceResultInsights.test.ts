import { describe, expect, it } from "vitest";
import {
  buildWorkspaceActionsDebugSections,
  buildWorkspaceActionsVm,
  buildWorkspaceDebtDebugSections,
  buildWorkspaceDebtVm,
  buildDebtWhatIfSummary,
  buildWorkspaceGuideBadge,
  buildWorkspaceKeyFindings,
  buildWorkspaceMonteCarloDebugSections,
  buildWorkspaceMonteCarloVm,
  buildWorkspaceResultSummaryVm,
  buildWorkspaceScenarioDebugSections,
  buildWorkspaceScenarioVm,
  buildWorkspaceWarningsGoalsDebugSections,
} from "../../../src/app/planning/_lib/workspaceResultInsights";

describe("workspaceResultInsights", () => {
  it("marks risk when cash is depleted", () => {
    const badge = buildWorkspaceGuideBadge({
      summaryWorstCashKrw: 0,
      hasNegativeCashflow: false,
      dtoDsrRatio: 0.32,
      missedGoals: 0,
      contributionSkippedCount: 0,
    });

    expect(badge.status).toBe("risk");
  });

  it("marks warn for missed goals without hard risk", () => {
    const badge = buildWorkspaceGuideBadge({
      summaryWorstCashKrw: 100_000,
      hasNegativeCashflow: false,
      dtoDsrRatio: 0.35,
      missedGoals: 1,
      contributionSkippedCount: 0,
    });

    expect(badge.status).toBe("warn");
  });

  it("builds key findings with cash, dsr, and goals summary", () => {
    const findings = buildWorkspaceKeyFindings({
      summaryWorstCashKrw: 100_000,
      summaryDsr: 0.25,
      totalGoals: 2,
      achievedGoalCount: 1,
      aggregatedWarningsCount: 3,
      summaryCriticalWarnings: 1,
    });

    expect(findings).toHaveLength(3);
    expect(findings[0]).toContain("현금흐름");
    expect(findings[1]).toContain("부채부담");
    expect(findings[2]).toContain("목표 진행");
  });

  it("builds debt what-if summary rows from counts", () => {
    const rows = buildDebtWhatIfSummary({
      termExtensionsCount: 2,
      termReductionsCount: 4,
      extraPaymentsCount: 1,
    });

    expect(rows.map((row) => row.count)).toEqual([2, 4, 1]);
  });

  it("builds scenario vm from dto scenario table", () => {
    const vm = buildWorkspaceScenarioVm({
      version: 1,
      meta: {
        generatedAt: "2026-03-07T00:00:00.000Z",
        snapshot: {},
        health: { criticalCount: 0 },
      },
      summary: {},
      warnings: {
        aggregated: [],
        top: [
          { code: "NEGATIVE_CASHFLOW", severity: "warn", count: 1, sampleMessage: "negative", message: "negative" } as never,
        ],
      },
      goals: [],
      timeline: { points: [] },
      scenarios: {
        table: [
          { id: "base", summary: { endNetWorthKrw: 100_000_000, worstCashKrw: 500_000, goalsAchievedCount: 1, warningsCount: 2 } },
          {
            id: "raise-income",
            title: "소득 증가",
            summary: { endNetWorthKrw: 110_000_000, worstCashKrw: 900_000, goalsAchievedCount: 2, warningsCount: 1 },
            diffVsBase: { keyMetrics: { endNetWorthDeltaKrw: 10_000_000, goalsAchievedDelta: 1 }, shortWhy: ["여유현금 증가"] },
          },
        ],
      },
      raw: {},
    } as never);

    expect(vm.baseSummary.endNetWorthKrw).toBe(100_000_000);
    expect(vm.baseWarnings[0]).toEqual({ reasonCode: "NEGATIVE_CASHFLOW", message: "negative" });
    expect(vm.comparisonRows[0]?.endNetWorthDeltaKrw).toBe(10_000_000);
    expect(vm.comparisonRows[0]?.shortWhy).toEqual(["여유현금 증가"]);
  });

  it("prefers canonical scenario summary fields when legacy fields also exist", () => {
    const vm = buildWorkspaceScenarioVm({
      version: 1,
      meta: {
        generatedAt: "2026-03-07T00:00:00.000Z",
        snapshot: {},
        health: { criticalCount: 0 },
      },
      summary: {},
      warnings: { aggregated: [], top: [] },
      goals: [],
      timeline: { points: [] },
      scenarios: {
        table: [
          {
            id: "base",
            summary: {
              endNetWorth: 80_000_000,
              endNetWorthKrw: 100_000_000,
              goalsAchieved: 1,
              goalsAchievedCount: 2,
              warningsCount: 1,
            },
          },
          {
            id: "raise-income",
            title: "소득 증가",
            summary: {
              endNetWorth: 90_000_000,
              endNetWorthKrw: 110_000_000,
              goalsAchieved: 2,
              goalsAchievedCount: 3,
              warningsCount: 0,
            },
            diffVsBase: { keyMetrics: { endNetWorthDeltaKrw: 10_000_000, goalsAchievedDelta: 1 }, shortWhy: [] },
          },
        ],
      },
      raw: {},
    } as never);

    expect(vm.baseSummary.endNetWorthKrw).toBe(100_000_000);
    expect(vm.baseSummary.goalsAchieved).toBe(2);
    expect(vm.comparisonRows[0]).toMatchObject({
      endNetWorthKrw: 110_000_000,
      goalsAchieved: 3,
    });
  });

  it("builds debt vm with canonical fields first and raw fallback second", () => {
    const vm = buildWorkspaceDebtVm({
      version: 1,
      meta: {
        generatedAt: "2026-03-07T00:00:00.000Z",
        snapshot: {},
        health: { criticalCount: 0 },
      },
      summary: {},
      warnings: { aggregated: [], top: [] },
      goals: [],
      timeline: { points: [] },
      debt: {
        dsrPct: 42,
        summaries: [{ title: "loan-a" }],
        refinance: [{ title: "refi-a" }],
        whatIf: {
          termExtensions: [{ id: 1 }],
          termReductions: [],
          extraPayments: [{ id: 1 }, { id: 2 }],
        },
      },
      raw: {
        debt: {
          summary: { totalMonthlyPaymentKrw: 555_000 },
          warnings: [{ code: "HIGH_DEBT_RATIO", message: "warning" }],
        },
      },
    } as never);

    expect(vm.meta.debtServiceRatio).toBe(0.42);
    expect(vm.meta.totalMonthlyPaymentKrw).toBe(555_000);
    expect(vm.summaries).toHaveLength(1);
    expect(vm.refinance).toHaveLength(1);
    expect(vm.whatIfSummary.map((row) => row.count)).toEqual([1, 0, 2]);
    expect(vm.warnings[0]?.code).toBe("HIGH_DEBT_RATIO");
  });

  it("builds monte carlo vm from dto percentiles and probabilities", () => {
    const vm = buildWorkspaceMonteCarloVm({
      version: 1,
      meta: {
        generatedAt: "2026-03-07T00:00:00.000Z",
        snapshot: {},
        health: { criticalCount: 0 },
      },
      summary: {},
      warnings: { aggregated: [], top: [] },
      goals: [],
      timeline: { points: [] },
      monteCarlo: {
        probabilities: {
          retirementDepletionBeforeEnd: 0.18,
        },
        percentiles: {
          endNetWorthKrw: { p10: 10_000_000, p50: 20_000_000, p90: 40_000_000 },
          worstCashKrw: { p10: 500_000, p50: 1_000_000, p90: 2_000_000 },
        },
      },
      raw: {},
    } as never);

    expect(vm.depletionProbability).toBe(0.18);
    expect(vm.percentiles.endNetWorthKrw).toEqual({ p10: 10_000_000, p50: 20_000_000, p90: 40_000_000 });
    expect(vm.percentiles.worstCashKrw).toEqual({ p10: 500_000, p50: 1_000_000, p90: 2_000_000 });
  });

  it("builds actions vm from dto action lists", () => {
    const vm = buildWorkspaceActionsVm({
      version: 1,
      meta: {
        generatedAt: "2026-03-07T00:00:00.000Z",
        snapshot: {},
        health: { criticalCount: 0 },
      },
      summary: {},
      warnings: { aggregated: [], top: [] },
      goals: [],
      timeline: { points: [] },
      actions: {
        top3: [
          { code: "CUT_SPENDING", title: "지출 조정", why: ["현금흐름 개선"] },
          { code: "PAY_DEBT", title: "부채 상환", why: ["DSR 개선"] },
        ],
        items: [
          {
            code: "CUT_SPENDING",
            severity: "warn",
            title: "지출 조정",
            summary: "지출 10% 절감",
            why: ["현금흐름 개선", "적자 완화"],
            steps: ["고정비 검토", "변동비 한도 설정"],
            cautions: ["생활 만족도 하락 가능"],
          },
        ],
      },
      raw: {},
    } as never);

    expect(vm.topActionTitles).toEqual(["지출 조정", "부채 상환"]);
    expect(vm.topActionsForInsight).toHaveLength(2);
    expect(vm.tableRows[0]).toMatchObject({
      code: "CUT_SPENDING",
      severity: "warn",
      whyCount: 2,
    });
    expect(vm.tableRows[0]?.steps).toEqual(["고정비 검토", "변동비 한도 설정"]);
    expect(vm.tableRows[0]?.cautions).toEqual(["생활 만족도 하락 가능"]);
  });

  it("builds summary vm from canonical dto fields", () => {
    const vm = buildWorkspaceResultSummaryVm({
      resultDto: {
        version: 1,
        meta: {
          generatedAt: "2026-03-07T00:00:00.000Z",
          snapshot: {},
          health: { criticalCount: 1 },
        },
        summary: {
          endNetWorthKrw: 123_000_000,
          worstCashKrw: 500_000,
          worstCashMonthIndex: 4,
          goalsAchieved: { achieved: 1, total: 2 },
          dsrPct: 35,
        },
        warnings: {
          aggregated: [
            {
              code: "NEGATIVE_CASHFLOW",
              severity: "warn",
              count: 2,
              firstMonth: 0,
              lastMonth: 1,
              sampleMessage: "negative",
            },
          ],
          top: [],
        },
        goals: [
          {
            id: "goal-1",
            title: "비상금",
            type: "emergencyFund",
            targetKrw: 12_000_000,
            currentKrw: 6_000_000,
            shortfallKrw: 6_000_000,
            targetMonth: 12,
            achieved: false,
            comment: "추가 적립 필요",
          },
          {
            id: "goal-2",
            title: "은퇴",
            type: "retirement",
            targetKrw: 100_000_000,
            currentKrw: 100_000_000,
            shortfallKrw: 0,
            targetMonth: 120,
            achieved: true,
          },
        ],
        timeline: {
          points: [
            {
              label: "start",
              monthIndex: 0,
              incomeKrw: 4_000_000,
              expensesKrw: 2_000_000,
              debtPaymentKrw: 500_000,
              cashKrw: 6_000_000,
              netWorthKrw: 30_000_000,
              totalDebtKrw: 20_000_000,
            },
            {
              label: "end",
              monthIndex: 11,
              cashKrw: 500_000,
              netWorthKrw: 123_000_000,
              totalDebtKrw: 10_000_000,
            },
          ],
        },
        raw: {
          simulate: {
            timelineSampled: [
              { month: 1, liquidAssets: 6_000_000, netWorth: 30_000_000, totalDebt: 20_000_000 },
              { month: 12, liquidAssets: 500_000, netWorth: 123_000_000, totalDebt: 10_000_000 },
            ],
            warnings: [{ code: "NEGATIVE_CASHFLOW", message: "negative" }],
            goalsStatus: [{ goalId: "goal-1" }],
          },
        },
      },
      debtMonthlyPaymentKrw: 500_000,
    });

    expect(vm.chartMode).toBe("key");
    expect(vm.chartPoints).toHaveLength(2);
    expect(vm.summaryGoalsText).toBe("1/2");
    expect(vm.summaryDsr).toBe(0.35);
    expect(vm.guideBadge.status).toBe("risk");
    expect(vm.aggregatedWarnings[0]?.firstMonth).toBe(1);
    expect(vm.summaryMonthlySurplusKrw).toBe(1_500_000);
    expect(vm.summaryEmergencyFundMonths).toBe(3);
  });

  it("builds warnings/goals and scenario debug sections outside beginner mode", () => {
    const warningsGoals = buildWorkspaceWarningsGoalsDebugSections({
      beginnerMode: false,
      aggregatedWarnings: [{ code: "WARN_A", severity: "warn", count: 2, sampleMessage: "warn" }],
      goalTableRows: [{ goalId: "goal-1", name: "비상금", achieved: false, targetMonth: 12, progressPct: 50, shortfallKrw: 5_000_000, interpretation: "추가 적립 필요" }],
      timelineSummaryRows: [{ label: "시작", monthIndex: 0, month: 1, liquidAssetsKrw: 1_000_000, netWorthKrw: 10_000_000, totalDebtKrw: 5_000_000, debtServiceRatio: 0.25, interpretation: "핵심 포인트 구간입니다." }],
      chartPoints: [{ monthIndex: 0, cashKrw: 1_000_000, netWorthKrw: 10_000_000, totalDebtKrw: 5_000_000 }],
    });
    const scenarios = buildWorkspaceScenarioDebugSections({
      beginnerMode: false,
      baseSummary: {
        endNetWorthKrw: 100_000_000,
        worstCashKrw: 500_000,
        goalsAchieved: 1,
        warningsCount: 2,
      },
      comparisonRows: [{
        id: "raise-income",
        title: "소득 증가",
        endNetWorthKrw: 110_000_000,
        worstCashKrw: 900_000,
        goalsAchieved: 2,
        warningsCount: 1,
        endNetWorthDeltaKrw: 10_000_000,
        goalsAchievedDelta: 1,
        shortWhy: ["여유현금 증가"],
      }],
      baseWarnings: [{ reasonCode: "NEGATIVE_CASHFLOW", message: "negative" }],
    });

    expect(warningsGoals.map((section) => section.label)).toEqual([
      "warning aggregates",
      "goal rows",
      "timeline summary",
      "chart points",
    ]);
    expect(scenarios[0]?.value).toEqual({
      endNetWorthKrw: 100_000_000,
      worstCashKrw: 500_000,
      goalsAchieved: 1,
      warningsCount: 2,
    });
  });

  it("builds monte/actions/debt debug sections and skips them in beginner mode", () => {
    const monte = buildWorkspaceMonteCarloDebugSections({
      beginnerMode: false,
      probabilities: { retirementDepletionBeforeEnd: 0.18 },
      endNetWorthKrw: { p50: 20_000_000 },
      worstCashKrw: { p50: 1_000_000 },
      depletionProbability: 0.18,
    });
    const actions = buildWorkspaceActionsDebugSections({
      beginnerMode: false,
      topActionTitles: ["지출 조정"],
      actionRows: [{
        code: "CUT_SPENDING",
        severity: "warn",
        title: "지출 조정",
        summary: "지출 10% 절감",
        whyCount: 2,
        steps: ["고정비 검토"],
        cautions: ["생활 만족도 하락 가능"],
      }],
    });
    const debt = buildWorkspaceDebtDebugSections({
      beginnerMode: false,
      debtMeta: {
        debtServiceRatio: 0.42,
        totalMonthlyPaymentKrw: 555_000,
      },
      debtSummaries: [{ title: "loan-a" }],
      debtRefinance: [{ title: "refi-a" }],
      debtWhatIfSummary: [{ title: "추가상환", count: 2, interpretation: "여유자금 투입" }],
      debtWarnings: [{ code: "HIGH_DEBT_RATIO", severity: "warn", count: 1, sampleMessage: "warning" }],
    });
    const beginnerSections = buildWorkspaceActionsDebugSections({
      beginnerMode: true,
      topActionTitles: ["지출 조정"],
      actionRows: [],
    });

    expect(monte.map((section) => section.label)).toEqual([
      "probabilities",
      "percentiles",
      "retirement depletion probability",
    ]);
    expect(actions.map((section) => section.label)).toEqual([
      "top action titles",
      "action rows",
    ]);
    expect(debt.map((section) => section.label)).toEqual([
      "debt meta",
      "debt summary rows",
      "debt refinance rows",
      "debt what-if summary",
      "debt warning rows",
    ]);
    expect(beginnerSections).toEqual([]);
  });
});
