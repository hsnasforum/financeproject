import { describe, expect, it } from "vitest";
import { safeBuildReportVMFromRun } from "../../src/app/planning/reports/_lib/reportViewModel";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function createRunRecord(options: {
  withEngine?: boolean;
  withResultDto?: boolean;
} = {}): PlanningRunRecord {
  const withEngine = options.withEngine !== false;
  const withResultDto = options.withResultDto !== false;
  const resultDto = buildResultDtoV1({
    generatedAt: "2026-03-05T00:00:00.000Z",
    simulate: {
      summary: {
        startNetWorthKrw: 10_000_000,
        endNetWorthKrw: 12_000_000,
        worstCashKrw: 2_000_000,
        worstCashMonthIndex: 3,
        goalsAchievedCount: 1,
        goalsMissedCount: 0,
        warningsCount: 0,
      },
      warnings: [],
      goalsStatus: [],
      keyTimelinePoints: [
        {
          monthIndex: 0,
          row: {
            month: 1,
            income: 4_000_000,
            expenses: 2_200_000,
            debtPayment: 300_000,
            liquidAssets: 4_000_000,
            netWorth: 10_000_000,
            totalDebt: 1_000_000,
          },
        },
      ],
      timeline: [
        {
          month: 1,
          income: 4_000_000,
          expenses: 2_200_000,
          debtPayment: 300_000,
          liquidAssets: 4_000_000,
          netWorth: 10_000_000,
          totalDebt: 1_000_000,
        },
      ],
    },
  });

  return {
    version: 1,
    id: "run-safe-build",
    profileId: "profile-1",
    createdAt: "2026-03-05T00:00:00.000Z",
    input: {
      horizonMonths: 12,
    },
    meta: {},
    outputs: {
      ...(withEngine
        ? {
          engineSchemaVersion: 1,
          engine: {
            stage: "DEBT",
            financialStatus: {
              stage: "DEBT",
              trace: {
                savingCapacity: 1_800_000,
                savingRate: 0.45,
                liquidAssets: 4_000_000,
                debtBalance: 1_000_000,
                emergencyFundTarget: 13_200_000,
                emergencyFundGap: 9_200_000,
                triggeredRules: ["debt_balance_positive"],
              },
            },
            stageDecision: {
              priority: "PAY_DEBT",
              investmentAllowed: false,
              warnings: ["부채 정리가 우선입니다."],
            },
          },
        }
        : {}),
      ...(withResultDto ? { resultDto } : {}),
      simulate: {
        ref: {
          name: "simulate",
          path: ".data/test/report-view-model-safe-build/run-safe-build/simulate.json",
        },
        summary: {
          endNetWorthKrw: 12_000_000,
          worstCashKrw: 2_000_000,
          worstCashMonthIndex: 3,
          goalsAchievedCount: 1,
          goalsMissedCount: 0,
          warningsCount: 0,
        },
        warnings: [],
        goalsStatus: [],
        keyTimelinePoints: [
          {
            monthIndex: 0,
            row: {
              month: 1,
              income: 4_000_000,
              expenses: 2_200_000,
              debtPayment: 300_000,
              liquidAssets: 4_000_000,
              netWorth: 10_000_000,
              totalDebt: 1_000_000,
            },
          },
        ],
        timeline: [
          {
            month: 1,
            income: 4_000_000,
            expenses: 2_200_000,
            debtPayment: 300_000,
            liquidAssets: 4_000_000,
            netWorth: 10_000_000,
            totalDebt: 1_000_000,
          },
        ],
      } as unknown as PlanningRunRecord["outputs"]["simulate"],
    },
  };
}

describe("safeBuildReportVMFromRun", () => {
  it("returns a report VM for canonical runs", () => {
    const result = safeBuildReportVMFromRun(createRunRecord(), {
      id: "report-1",
      runId: "run-safe-build",
      createdAt: "2026-03-05T00:00:00.000Z",
    });

    expect(result.error).toBeNull();
    expect(result.vm?.header.reportId).toBe("report-1");
    expect(result.vm?.contract?.engineSchemaVersion).toBe(1);
  });

  it("rebuilds a fallback report VM when engine envelope is missing", () => {
    const result = safeBuildReportVMFromRun(createRunRecord({ withEngine: false }), {
      id: "report-1",
      runId: "run-safe-build",
      createdAt: "2026-03-05T00:00:00.000Z",
    });

    expect(result.error).toBeNull();
    expect(result.vm?.contract?.engineSchemaVersion).toBe(0);
    expect(result.vm?.contract?.fallbacks).toEqual(["legacyEngineFallback"]);
    expect(result.vm?.summaryCards.endNetWorthKrw).toBe(12_000_000);
  });

  it("rebuilds a fallback report VM when resultDto is missing", () => {
    const result = safeBuildReportVMFromRun(createRunRecord({ withResultDto: false }), {
      id: "report-1",
      runId: "run-safe-build",
      createdAt: "2026-03-05T00:00:00.000Z",
    });

    expect(result.error).toBeNull();
    expect(result.vm?.contract?.engineSchemaVersion).toBe(1);
    expect(result.vm?.contract?.fallbacks).toEqual(["legacyResultDtoFallback"]);
    expect(result.vm?.summaryCards.endNetWorthKrw).toBe(12_000_000);
  });
});
