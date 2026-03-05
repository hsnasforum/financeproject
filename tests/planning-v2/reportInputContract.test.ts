import { describe, expect, it } from "vitest";
import {
  getPlanningFallbackUsageSnapshot,
  resetPlanningFallbackUsageSnapshot,
} from "../../src/lib/planning/engine";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";
import { buildReportInputContractFromRun } from "../../src/lib/planning/reports/reportInputContract";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function createRunRecord(withEngine: boolean): PlanningRunRecord {
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

  const engine = {
    stage: "DEBT" as const,
    financialStatus: {
      stage: "DEBT" as const,
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
      priority: "PAY_DEBT" as const,
      investmentAllowed: false,
      warnings: ["부채 정리가 우선입니다."],
    },
  };

  return {
    version: 1,
    id: "run-report-contract",
    profileId: "profile-1",
    createdAt: "2026-03-05T00:00:00.000Z",
    input: {
      horizonMonths: 12,
    },
    meta: {},
    outputs: {
      ...(withEngine ? { engineSchemaVersion: 1, engine } : {}),
      resultDto,
      simulate: {
      } as PlanningRunRecord["outputs"]["simulate"],
    },
  };
}

describe("buildReportInputContractFromRun", () => {
  it("uses engine envelope from run outputs when available", () => {
    resetPlanningFallbackUsageSnapshot();
    const before = getPlanningFallbackUsageSnapshot();
    const contract = buildReportInputContractFromRun(createRunRecord(true));
    expect(contract.runId).toBe("run-report-contract");
    expect(contract.engine.stage).toBe("DEBT");
    expect(contract.engine.stageDecision.priority).toBe("PAY_DEBT");
    expect(contract.engineSchemaVersion).toBe(1);
    expect(getPlanningFallbackUsageSnapshot().legacyReportContractFallbackCount).toBe(
      before.legacyReportContractFallbackCount,
    );
  });

  it("builds legacy fallback engine when run output has no engine envelope", () => {
    resetPlanningFallbackUsageSnapshot();
    const before = getPlanningFallbackUsageSnapshot();
    const contract = buildReportInputContractFromRun(createRunRecord(false), {
      allowLegacyEngineFallback: true,
    });
    expect(contract.runId).toBe("run-report-contract");
    expect(["DEFICIT", "DEBT", "EMERGENCY", "INVEST"]).toContain(contract.engine.stage);
    expect(typeof contract.engine.stageDecision.priority).toBe("string");
    expect(contract.engineSchemaVersion).toBe(0);
    expect(getPlanningFallbackUsageSnapshot().legacyReportContractFallbackCount).toBe(
      before.legacyReportContractFallbackCount + 1,
    );
  });
});
