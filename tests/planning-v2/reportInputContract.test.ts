import { describe, expect, it } from "vitest";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";
import {
  buildReportInputContractFromRun,
  getReportInputContractOptions,
  resolveReportContractMode,
} from "../../src/lib/planning/reports/reportInputContract";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function createRunRecord(withEngine = true, withResultDto = true): PlanningRunRecord {
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
    id: "run-report-contract",
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
      simulate: {} as PlanningRunRecord["outputs"]["simulate"],
    },
  };
}

describe("buildReportInputContractFromRun", () => {
  it("forces strict contract mode", () => {
    expect(resolveReportContractMode("strict")).toBe("strict");
    expect(resolveReportContractMode("compat")).toBe("strict");
    expect(resolveReportContractMode("")).toBe("strict");
    expect(getReportInputContractOptions()).toEqual({ mode: "strict" });
  });

  it("uses outputs.engine and outputs.resultDto only", () => {
    const contract = buildReportInputContractFromRun(createRunRecord(true, true));
    expect(contract.runId).toBe("run-report-contract");
    expect(contract.engine.stage).toBe("DEBT");
    expect(contract.engineSchemaVersion).toBe(1);
    expect(contract.fallbacks).toEqual([]);
  });

  it("fails when resultDto is missing", () => {
    expect(() => buildReportInputContractFromRun(createRunRecord(true, false))).toThrow(
      "resultDto is missing in run outputs",
    );
  });

  it("fails when engine envelope is missing", () => {
    expect(() => buildReportInputContractFromRun(createRunRecord(false, true))).toThrow(
      "engine envelope is missing in run outputs",
    );
  });

  it("fills legacy debt fields from dto.raw.debt for report contract", () => {
    const run = createRunRecord(true, true);
    const dto = run.outputs.resultDto;
    if (!dto) throw new Error("test setup failed: resultDto missing");
    dto.debt = {
      dsrPct: 41.2,
    };
    dto.raw = {
      ...(dto.raw ?? {}),
      debt: {
        summary: {
          totalMonthlyPaymentKrw: 777_777,
        },
        warnings: [
          {
            code: "HIGH_DEBT_RATIO",
            message: "DSR이 높습니다.",
          },
        ],
      },
    };

    const contract = buildReportInputContractFromRun(run);
    expect(contract.resultDto.debt?.totalMonthlyPaymentKrw).toBe(777_777);
    expect(contract.resultDto.debt?.warnings?.[0]?.code).toBe("HIGH_DEBT_RATIO");
  });

  it("keeps canonical debt fields when dto.debt already has values", () => {
    const run = createRunRecord(true, true);
    const dto = run.outputs.resultDto;
    if (!dto) throw new Error("test setup failed: resultDto missing");
    dto.debt = {
      dsrPct: 39.9,
      totalMonthlyPaymentKrw: 123_456,
      warnings: [
        {
          code: "CANONICAL_WARNING",
          message: "canonical",
        },
      ],
    };
    dto.raw = {
      ...(dto.raw ?? {}),
      debt: {
        summary: {
          totalMonthlyPaymentKrw: 999_999,
        },
        warnings: [
          {
            code: "RAW_WARNING",
            message: "raw",
          },
        ],
      },
    };

    const contract = buildReportInputContractFromRun(run);
    expect(contract.resultDto.debt?.totalMonthlyPaymentKrw).toBe(123_456);
    expect(contract.resultDto.debt?.warnings?.[0]?.code).toBe("CANONICAL_WARNING");
  });
});
