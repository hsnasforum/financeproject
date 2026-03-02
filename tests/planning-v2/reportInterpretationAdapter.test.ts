import { describe, expect, it } from "vitest";
import { toInterpretationInputFromReportVM } from "../../src/app/planning/reports/_lib/reportInterpretationAdapter";
import { type ReportVM } from "../../src/app/planning/reports/_lib/reportViewModel";

function fixtureVm(): ReportVM {
  return {
    header: { reportId: "report-1", createdAt: "2026-03-01T00:00:00.000Z", runId: "run-1" },
    stage: { overallStatus: "PARTIAL_SUCCESS", byId: {} },
    snapshot: { id: "snap-1", staleDays: 80 },
    summaryCards: {
      monthlySurplusKrw: 120_000,
      dsrPct: 42,
      emergencyFundMonths: 2.5,
      debtTotalKrw: 30_000_000,
      totalMonthlyDebtPaymentKrw: 600_000,
      endNetWorthKrw: 50_000_000,
      worstCashKrw: -150_000,
      criticalWarnings: 1,
      totalWarnings: 4,
      goalsAchieved: "1/3",
    },
    warningAgg: [],
    goalsTable: [],
    topActions: [],
    timelinePoints: [],
    insight: {
      summaryMetrics: {
        monthlySurplusKrw: 120_000,
        emergencyFundMonths: 2.5,
        endNetWorthKrw: 50_000_000,
        worstCashKrw: -150_000,
        dsrPct: 42,
        goalsAchievedText: "1/3",
      },
      summaryEvidence: {
        monthlySurplusKrw: {
          metric: "monthlySurplusKrw",
          formula: "monthlySurplusKrw = monthlyIncomeKrw - monthlyExpensesKrw - monthlyDebtPaymentKrw",
          inputs: {
            monthlyIncomeKrw: 5_000_000,
            monthlyExpensesKrw: 4_200_000,
            monthlyDebtPaymentKrw: 680_000,
          },
          assumptions: ["month=start 기준"],
        },
      },
      aggregatedWarnings: [
        {
          code: "NO_SUCH_WARNING",
          severity: "warn",
          count: 2,
          firstMonth: 0,
          lastMonth: 1,
          sampleMessage: "unknown",
        },
      ],
      goals: [
        {
          name: "비상금",
          targetAmount: 12_000_000,
          currentAmount: 6_000_000,
          shortfall: 6_000_000,
          targetMonth: 12,
          achieved: false,
          comment: "진행 중",
        },
      ],
      outcomes: {
        actionsTop: [],
        snapshotMeta: {
          staleDays: 80,
        },
        monteCarlo: {
          retirementDepletionBeforeEnd: 0.12,
        },
      },
    },
    raw: {},
  };
}

describe("toInterpretationInputFromReportVM", () => {
  it("maps ReportVM insight fields to interpretation input", () => {
    const input = toInterpretationInputFromReportVM(fixtureVm());

    expect(input.summary.monthlySurplusKrw).toBe(120_000);
    expect(input.summary.dsrPct).toBe(42);
    expect(input.aggregatedWarnings).toHaveLength(1);
    expect(input.aggregatedWarnings[0]?.code).toBe("NO_SUCH_WARNING");
    expect(input.goals).toHaveLength(1);
    expect(input.outcomes?.snapshotMeta?.staleDays).toBe(80);
    expect(input.summaryEvidence?.monthlySurplusKrw?.inputs.monthlyIncomeKrw).toBe(5_000_000);
  });
});
