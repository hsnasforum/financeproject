import { describe, expect, it } from "vitest";
import {
  buildEnginePayloadFromProfile,
  resolveAssumptionsContextForProfile,
  toEngineInputFromProfile,
} from "../../../../src/lib/planning/server/v2/toEngineInput";
import { type AssumptionsV2 } from "../../../../src/lib/planning/v2/scenarios";
import { type ProfileV2, type SimulationAssumptionsV2 } from "../../../../src/lib/planning/v2/types";

function baseProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 4_500_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 2_500_000,
    investmentAssets: 3_000_000,
    debts: [
      {
        id: "loan-a",
        name: "Loan A",
        balance: 12_000_000,
        minimumPayment: 300_000,
        aprPct: 5.2,
        remainingMonths: 48,
        repaymentType: "amortizing" as const,
      },
      {
        id: "loan-b",
        name: "Loan B",
        balance: 3_000_000,
        minimumPayment: 90_000,
        aprPct: 4.7,
        remainingMonths: 24,
        repaymentType: "interestOnly",
      },
    ],
    goals: [],
  };
}

function baseAssumptions(): AssumptionsV2 {
  return {
    inflationPct: 2.1,
    investReturnPct: 4.5,
    cashReturnPct: 2.0,
    withdrawalRatePct: 4.0,
    debtRates: {},
  };
}

function baseSimulationAssumptions(): SimulationAssumptionsV2 {
  return {
    inflation: 2.1,
    expectedReturn: 4.5,
    debtRates: {},
  };
}

describe("toEngineInput helpers", () => {
  it("maps profile fields into engine input shape", () => {
    expect(toEngineInputFromProfile(baseProfile())).toEqual({
      monthlyIncome: 4_500_000,
      monthlyExpense: 2_300_000,
      age: undefined,
      liquidAssets: 2_500_000,
      debtBalance: 15_000_000,
    });
  });

  it("builds engine payload from profile with attached engine envelope", () => {
    const { engineResult, data } = buildEnginePayloadFromProfile<{ summary: { surplusKrw: number } }, { surplusKrw: number }>(
      baseProfile(),
      (resolvedEngineResult) => ({
        summary: resolvedEngineResult.core ?? { surplusKrw: 0 },
      }),
      {
        runCore: (input) => ({
          surplusKrw: input.monthlyIncome - input.monthlyExpense,
        }),
      },
    );

    expect(engineResult.input.debtBalance).toBe(15_000_000);
    expect(engineResult.core).toEqual({ surplusKrw: 2_200_000 });
    expect(data.engineSchemaVersion).toBe(1);
    expect(data.engine.stage).toBe(engineResult.status.stage);
    expect(data.engine.financialStatus.stage).toBe(engineResult.status.stage);
    expect(data.engine.stageDecision.priority).toBe(engineResult.decision.priority);
    expect(data.summary).toEqual({ surplusKrw: 2_200_000 });
  });

  it("returns resolved assumptions context from planning service", async () => {
    const planningService = {
      resolveAssumptionsContext: async () => ({
        assumptions: baseAssumptions(),
        simulationAssumptions: baseSimulationAssumptions(),
        snapshotMeta: { id: "latest", missing: false },
        snapshotId: "latest",
        health: {
          summary: {
            warningsCount: 0,
            criticalCount: 0,
            warningCodes: [],
            flags: {
              snapshotMissing: false,
              optimisticReturn: false,
              riskMismatch: false,
            },
          },
          warnings: [],
        },
        taxPensionExplain: { applied: false, notes: [] },
        normalizedOverrides: {},
        scenarioOverrideForCache: {},
      }),
    };

    const result = await resolveAssumptionsContextForProfile({
      planningService,
      profile: baseProfile(),
      riskTolerance: "mid",
      assumptionsOverridesRaw: {},
      requestedSnapshotId: "latest",
    });

    expect(result).toMatchObject({
      ok: true,
      context: {
        snapshotId: "latest",
        snapshotMeta: { id: "latest" },
      },
    });
  });

  it("normalizes planning errors when assumptions context resolution fails", async () => {
    const planningService = {
      resolveAssumptionsContext: async () => {
        throw { code: "SNAPSHOT_NOT_FOUND", message: "raw snapshot error" };
      },
    };

    const result = await resolveAssumptionsContextForProfile({
      planningService,
      profile: baseProfile(),
      riskTolerance: "mid",
      assumptionsOverridesRaw: {},
      requestedSnapshotId: "missing",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SNAPSHOT_NOT_FOUND",
        message: "지정한 스냅샷을 찾을 수 없습니다.",
        status: 400,
      },
    });
  });
});
