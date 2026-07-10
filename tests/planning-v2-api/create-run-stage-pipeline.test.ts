import { describe, expect, it, vi } from "vitest";
import {
  parseCreatePlanningRunCommand,
  type CreatePlanningRunCommand,
  type RunsCreateBody,
} from "../../src/lib/planning/server/runs/createRunCommandParser";
import { runCreatePlanningRunStagePipeline } from "../../src/lib/planning/server/runs/createRunStagePipeline";
import { runStagePipeline } from "../../src/lib/planning/v2/stagePipeline";
import { type AssumptionsV2 } from "../../src/lib/planning/v2/scenarios";
import { type ProfileV2, type SimulationAssumptionsV2 } from "../../src/lib/planning/v2/types";

const baseAssumptions: AssumptionsV2 = {
  inflationPct: 2,
  investReturnPct: 4,
  cashReturnPct: 2,
  withdrawalRatePct: 4,
};

const simulationAssumptions: SimulationAssumptionsV2 = {
  inflation: 0.02,
  expectedReturn: 0.04,
};

function sampleProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 2_000_000,
    investmentAssets: 3_000_000,
    debts: [
      {
        id: "loan-1",
        name: "Loan 1",
        balance: 10_000_000,
        minimumPayment: 300_000,
        apr: 0.052,
        remainingMonths: 48,
        repaymentType: "amortizing",
      },
    ],
    goals: [
      {
        id: "goal-1",
        name: "Goal 1",
        targetAmount: 8_000_000,
        targetMonth: 24,
        priority: 3,
      },
    ],
  };
}

function parseCommand(input: NonNullable<NonNullable<RunsCreateBody>["input"]> = {}): CreatePlanningRunCommand {
  const parsed = parseCreatePlanningRunCommand({
    profileId: "profile-1",
    title: "Stage pipeline run",
    input: {
      horizonMonths: 12,
      policyId: "balanced",
      runScenarios: false,
      getActions: false,
      analyzeDebt: false,
      ...input,
    },
  }, {
    randomUUID: () => "request-1",
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  return parsed.command;
}

describe("create run stage pipeline", () => {
  it("runs the planning stage pipeline and resolves outputs outside createPlanningRun", async () => {
    const matchCandidatesProvider = vi.fn(async (actions) => actions);
    const result = await runCreatePlanningRunStagePipeline({
      command: parseCommand(),
      profile: sampleProfile(),
      baseAssumptions,
      finalSimulationAssumptions: simulationAssumptions,
      riskTolerance: "mid",
      snapshotAsOf: "2026-07-01",
      requestBaseUrl: "http://localhost:3000",
      dependencies: {
        runPipeline: runStagePipeline,
        matchCandidatesProvider,
      },
    });

    expect(result.pipeline.overallStatus).toBe("SUCCESS");
    expect(result.stages).toBe(result.pipeline.stages);
    expect(result.stages.find((stage) => stage.id === "simulate")?.status).toBe("SUCCESS");
    expect(result.stages.find((stage) => stage.id === "actions")?.reason).toBe("OPTION_DISABLED");
    expect(result.stageOutputs.simulatePlan?.timeline).toHaveLength(12);
    expect(result.stageOutputs.actionsOutput).toBeNull();
    expect(matchCandidatesProvider).not.toHaveBeenCalled();
  });

  it("keeps Monte Carlo budget decisions inside the stage pipeline boundary", async () => {
    const result = await runCreatePlanningRunStagePipeline({
      command: parseCommand({
        horizonMonths: 1_200,
        monteCarlo: {
          paths: 20_000,
          seed: 7,
        },
      }),
      profile: sampleProfile(),
      baseAssumptions,
      finalSimulationAssumptions: simulationAssumptions,
      riskTolerance: "mid",
      requestBaseUrl: "http://localhost:3000",
      dependencies: {
        runPipeline: runStagePipeline,
        matchCandidatesProvider: async (actions) => actions,
      },
    });

    const monteCarloStage = result.stages.find((stage) => stage.id === "monteCarlo");
    expect(result.pipeline.overallStatus).toBe("PARTIAL_SUCCESS");
    expect(monteCarloStage?.status).toBe("SKIPPED");
    expect(monteCarloStage?.reason).toBe("BUDGET_EXCEEDED");
    expect(result.stageOutputs.monteCarloOutput).toBeUndefined();
    expect(result.stageOutputs.simulatePlan?.timeline).toHaveLength(1_200);
  });
});
