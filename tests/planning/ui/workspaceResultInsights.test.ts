import { describe, expect, it } from "vitest";
import {
  buildDebtWhatIfSummary,
  buildWorkspaceGuideBadge,
  buildWorkspaceKeyFindings,
  buildWorkspaceResultSummaryVm,
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
});
