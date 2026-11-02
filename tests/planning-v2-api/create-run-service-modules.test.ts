import { describe, expect, it } from "vitest";
import {
  parseCreatePlanningRunCommand,
  type CreatePlanningRunCommand,
} from "../../src/lib/planning/server/runs/createRunCommandParser";
import {
  buildPlanningStagePlan,
  createPlanningStagePlanState,
  resolvePlanningStageOutputs,
} from "../../src/lib/planning/server/runs/createRunStagePlan";
import {
  assemblePlanningRunRecordInput,
  totalStageDurationMs,
} from "../../src/lib/planning/server/runs/createRunRecordAssembler";
import { evaluateCreatePlanningRunPreflight } from "../../src/lib/planning/server/runs/createRunPreflight";
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

function parseCommand(overrides: Partial<CreatePlanningRunCommand> = {}): CreatePlanningRunCommand {
  const parsed = parseCreatePlanningRunCommand({
    profileId: "profile-1",
    title: "Module run",
    input: {
      horizonMonths: 12,
      policyId: "balanced",
      runScenarios: false,
      getActions: false,
      analyzeDebt: false,
      ...overrides,
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

describe("planning create run service modules", () => {
  it("parses create-run command input without route or persistence dependencies", () => {
    const parsed = parseCreatePlanningRunCommand({
      profileId: " profile-1 ",
      title: " Test run ",
      scenario: {
        id: "legacy-scenario-1",
        name: "Legacy scenario",
        createdAt: "2026-06-30T00:00:00.000Z",
        patches: [
          { path: "/monthlyIncomeNet", op: "multiply", value: 1.1 },
        ],
      },
      input: {
        horizonMonths: 24,
        policyId: "growth",
        snapshotId: "latest",
        includeProducts: true,
        monteCarlo: { paths: 100, seed: 7 },
        debtStrategy: {
          offers: [
            {
              liabilityId: "loan-1",
              newAprPct: 0.041,
              feeKrw: 123.4,
              title: "Refi",
            },
          ],
          options: {
            extraPaymentKrw: 10_000,
            compareTermsMonths: [12, "24"],
          },
        },
      },
    }, {
      randomUUID: () => "request-parse",
      now: () => new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.command.profileId).toBe("profile-1");
    expect(parsed.command.title).toBe("Test run");
    expect(parsed.command.policyId).toBe("growth");
    expect(parsed.command.requestedSnapshotId).toBeUndefined();
    expect(parsed.command.includeProducts).toBe(true);
    expect(parsed.command.monteCarloConfig).toEqual({ paths: 100, seed: 7 });
    expect(parsed.command.debtStrategyInput.offers[0]).toMatchObject({
      liabilityId: "loan-1",
      newAprPct: 4.1,
      title: "Refi",
    });
    expect(parsed.command.scenarioMeta?.id).toBe("legacy-scenario-1");
  });

  it("builds a stage plan that can run outside createPlanningRun", async () => {
    const profile = sampleProfile();
    const command = parseCommand();
    const state = createPlanningStagePlanState();
    const pipeline = await runStagePipeline(buildPlanningStagePlan({
      profile,
      horizonMonths: command.horizonMonths,
      policyId: command.policyId,
      baseAssumptions,
      finalSimulationAssumptions: simulationAssumptions,
      riskTolerance: "mid",
      runScenariosEnabled: command.runScenariosEnabled,
      getActionsEnabled: command.getActionsEnabled,
      analyzeDebtEnabled: command.analyzeDebtEnabled,
      includeProducts: command.includeProducts,
      monteCarloBudget: null,
      debtStrategyInput: command.debtStrategyInput,
      requestBaseUrl: "http://localhost:3000",
      matchCandidatesProvider: async (actions) => actions,
      state,
    }));
    const outputs = resolvePlanningStageOutputs(pipeline, state);

    expect(pipeline.overallStatus).toBe("SUCCESS");
    expect(pipeline.stages.find((stage) => stage.id === "simulate")?.status).toBe("SUCCESS");
    expect(pipeline.stages.find((stage) => stage.id === "actions")?.reason).toBe("OPTION_DISABLED");
    expect(outputs.simulatePlan?.timeline).toHaveLength(12);
    expect(outputs.actionsOutput).toBeNull();
  });

  it("evaluates preflight blocks without route or repository dependencies", () => {
    const command = parseCommand();
    const preflight = evaluateCreatePlanningRunPreflight({
      profile: sampleProfile(),
      debtStrategyInput: {
        offers: [
          {
            liabilityId: "missing-loan",
            newAprPct: 4.2,
          },
        ],
      },
      assumptionsOverride: command.assumptionsOverride,
      horizonMonths: command.horizonMonths,
    });

    expect(preflight.ok).toBe(false);
    if (preflight.ok) return;
    expect(preflight.responseIssues.some((issue) => issue.includes("expected ids: loan-1"))).toBe(true);
    expect(preflight.meta.preflight.blocks.length).toBeGreaterThan(0);
  });

  it.each([
    { budget: 100_000, minima: [0, 0], expected: { a: 50_000, b: 50_000 } },
    { budget: 200_000, minima: [100_000, 100_000], expected: { a: 100_000, b: 100_000 } },
    { budget: 100_000, minima: [120_000, 80_000], expected: { a: 60_000, b: 40_000 } },
  ])("assembles actual goal funding into record and DTO without repository writes: $budget / $minima", async ({ budget, minima, expected }) => {
    const profile: ProfileV2 = {
      monthlyIncomeNet: budget,
      monthlyEssentialExpenses: 0,
      monthlyDiscretionaryExpenses: 0,
      liquidAssets: 0,
      investmentAssets: 0,
      debts: [],
      goals: ["b", "a"].map((id) => ({
        id, name: id, targetAmount: 10_000_000, targetMonth: 12, priority: 3,
        minimumMonthlyContribution: minima[id === "a" ? 0 : 1],
      })),
    };
    const command = parseCommand({ horizonMonths: 1 });
    const state = createPlanningStagePlanState();
    const pipeline = await runStagePipeline(buildPlanningStagePlan({
      profile,
      horizonMonths: command.horizonMonths,
      policyId: command.policyId,
      baseAssumptions,
      finalSimulationAssumptions: { inflation: 0, expectedReturn: 0 },
      riskTolerance: "mid",
      snapshotAsOf: "2026-07-01",
      runScenariosEnabled: command.runScenariosEnabled,
      getActionsEnabled: command.getActionsEnabled,
      analyzeDebtEnabled: command.analyzeDebtEnabled,
      includeProducts: command.includeProducts,
      monteCarloBudget: null,
      debtStrategyInput: command.debtStrategyInput,
      requestBaseUrl: "http://localhost:3000",
      matchCandidatesProvider: async (actions) => actions,
      state,
    }));
    const stageOutputs = resolvePlanningStageOutputs(pipeline, state);
    expect(pipeline.overallStatus).toBe("SUCCESS");
    expect(stageOutputs.simulatePlan).toBeTruthy();
    if (!stageOutputs.simulatePlan) return;
    expect(Object.fromEntries(stageOutputs.simulatePlan.goalStatus.map((item) => [item.goalId, item.currentAmount])))
      .toEqual(expected);
    expect(stageOutputs.simulatePlan.timeline[0]).toMatchObject({
      goalContribution: budget, goalFundAssets: budget, liquidAssets: 0, netWorth: budget,
    });

    const assembled = assemblePlanningRunRecordInput({
      command,
      profileId: "profile-1",
      title: command.title,
      profile,
      profileNormalization: { defaultsApplied: [], fixesApplied: [] },
      snapshotId: "snapshot-1",
      snapshot: { id: "snapshot-1", asOf: "2026-07-01" },
      snapshotMeta: { id: "snapshot-1", asOf: "2026-07-01", missing: false },
      healthSummary: { warningCodes: [], criticalCount: 0 },
      baseAssumptions,
      appliedOverrides: [],
      overallStatus: pipeline.overallStatus,
      stages: pipeline.stages,
      stageOutputs: {
        ...stageOutputs,
        simulatePlan: stageOutputs.simulatePlan,
      },
    });

    expect(assembled.recordInput.profileId).toBe("profile-1");
    expect(assembled.recordInput.input).toMatchObject({
      horizonMonths: 1,
      policyId: "balanced",
      snapshotId: "snapshot-1",
      runScenarios: false,
      getActions: false,
      analyzeDebt: false,
    });
    expect(assembled.recordInput.outputs.simulate).toEqual(assembled.outputs.simulate);
    expect(assembled.recordInput.outputs.resultDto).toEqual(assembled.resultDto);
    expect(assembled.outputs.simulate.goalsStatus).toEqual(stageOutputs.simulatePlan.goalStatus);
    expect(assembled.outputs.simulate.keyTimelinePoints).toEqual([{ monthIndex: 0, row: stageOutputs.simulatePlan.timeline[0] }]);
    expect(Object.fromEntries(assembled.resultDto.goals.map((item) => [item.id, item.currentKrw]))).toEqual(expected);
    // DTO retains the report's name ordering; engine and stored simulation retain input order.
    expect(assembled.resultDto.goals.map((item) => item.id)).toEqual(["a", "b"]);
    expect(assembled.resultDto.summary).toMatchObject({ endNetWorthKrw: budget });
    expect(assembled.resultDto.timeline.points).toHaveLength(1);
    expect(assembled.resultDto.timeline.points[0]).toMatchObject({ monthIndex: 0, cashKrw: 0, netWorthKrw: budget });
    expect(assembled.recordInput.reproducibility?.assumptionsSnapshotId).toBe("snapshot-1");
    expect(totalStageDurationMs(pipeline.stages)).toBeGreaterThanOrEqual(0);
  });
});
