import { type ActionItemV2 } from "../v2/actions/types";
import { buildActionsFromPlan } from "../v2/actions/buildActions";
import { matchCandidates } from "../v2/actions/matchFinlifeCandidates";
import { checkMonteCarloBudget } from "../v2/budget";
import { computeDebtStrategy } from "../v2/debt/strategy";
import { type LiabilityV2 } from "../v2/debt/types";
import { runMonteCarlo } from "../v2/monteCarlo";
import { type AllocationPolicyId } from "../v2/policy/types";
import { runScenarios } from "../v2/runScenarios";
import { type AssumptionsV2, type RiskTolerance } from "../v2/scenarios";
import { simulateMonthly } from "../v2/simulateMonthly";
import { type ProfileV2, type SimulationResultV2 } from "../v2/types";
import { decimalToAprPct } from "../../v2/aprBoundary";
import { type StagePipelineInput, type StagePipelineOutput } from "../../v2/stagePipeline";
import { type CreatePlanningRunCommand, isFiniteNumber } from "./createRunCommandParser";

type DebtStrategyInput = CreatePlanningRunCommand["debtStrategyInput"];
type MonteCarloConfig = NonNullable<CreatePlanningRunCommand["monteCarloConfig"]>;
type MonteCarloBudget = ReturnType<typeof checkMonteCarloBudget> | null;
type ActionsOutput = Awaited<ReturnType<typeof matchCandidates>> | ReturnType<typeof buildActionsFromPlan>;

export type PlanningStagePlanState = {
  plan: SimulationResultV2 | null;
  scenariosResult: ReturnType<typeof runScenarios> | null;
  monteCarloResult: ReturnType<typeof runMonteCarlo> | null;
  actionsResult: ActionsOutput | null;
  debtStrategyResult: ReturnType<typeof computeDebtStrategy> | null;
};

export type ResolvedPlanningStageOutputs = {
  simulatePlan: SimulationResultV2 | null;
  scenariosOutput: ReturnType<typeof runScenarios> | null;
  monteCarloOutput: ReturnType<typeof runMonteCarlo> | null;
  actionsOutput: ActionItemV2[] | null;
  debtStrategyOutput: ReturnType<typeof computeDebtStrategy> | null;
};

export function createPlanningStagePlanState(): PlanningStagePlanState {
  return {
    plan: null,
    scenariosResult: null,
    monteCarloResult: null,
    actionsResult: null,
    debtStrategyResult: null,
  };
}

export function buildDebtLiabilitiesFromProfile(profile: Pick<ProfileV2, "debts">, fallbackMonths: number): LiabilityV2[] {
  return profile.debts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    type: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, debt.balance),
    aprPct: isFiniteNumber(debt.aprPct) ? debt.aprPct : decimalToAprPct(debt.apr ?? 0),
    remainingMonths: Math.max(1, debt.remainingMonths ?? fallbackMonths),
    minimumPaymentKrw: Math.max(0, debt.minimumPayment),
  }));
}

export function buildPlanningStagePlan(input: {
  profile: ProfileV2;
  horizonMonths: number;
  policyId: AllocationPolicyId;
  baseAssumptions: AssumptionsV2;
  finalSimulationAssumptions: Parameters<typeof simulateMonthly>[1];
  riskTolerance: RiskTolerance;
  snapshotAsOf?: string;
  runScenariosEnabled: boolean;
  getActionsEnabled: boolean;
  analyzeDebtEnabled: boolean;
  includeProducts: boolean;
  monteCarloConfig?: MonteCarloConfig;
  monteCarloBudget: MonteCarloBudget;
  debtStrategyInput: DebtStrategyInput;
  requestBaseUrl: string;
  matchCandidatesProvider: typeof matchCandidates;
  state?: PlanningStagePlanState;
}): StagePipelineInput {
  const state = input.state ?? createPlanningStagePlanState();
  const debtLiabilities = buildDebtLiabilitiesFromProfile(input.profile, input.horizonMonths);

  return {
    simulate: {
      outputRefKey: "outputs.simulate",
      run: () => {
        state.plan = simulateMonthly(input.profile, input.finalSimulationAssumptions, input.horizonMonths, {
          policyId: input.policyId,
        });
        return state.plan;
      },
    },
    scenarios: {
      enabled: input.runScenariosEnabled,
      outputRefKey: "outputs.scenarios",
      run: () => {
        state.scenariosResult = runScenarios({
          profile: input.profile,
          horizonMonths: input.horizonMonths,
          baseAssumptions: input.baseAssumptions,
          riskTolerance: input.riskTolerance,
          policyId: input.policyId,
        });
        return state.scenariosResult;
      },
    },
    monteCarlo: {
      enabled: Boolean(input.monteCarloConfig),
      ...(input.monteCarloConfig && input.monteCarloBudget && !input.monteCarloBudget.ok
        ? {
          preSkipped: {
            reason: "BUDGET_EXCEEDED" as const,
            message: input.monteCarloBudget.message,
          },
        }
        : {}),
      outputRefKey: "outputs.monteCarlo",
      run: () => {
        if (!input.monteCarloConfig) return null;
        state.monteCarloResult = runMonteCarlo({
          profile: input.profile,
          horizonMonths: input.horizonMonths,
          baseAssumptions: input.baseAssumptions,
          policyId: input.policyId,
          paths: input.monteCarloConfig.paths,
          seed: input.monteCarloConfig.seed,
          riskTolerance: input.riskTolerance,
        });
        return state.monteCarloResult;
      },
    },
    actions: {
      enabled: input.getActionsEnabled,
      outputRefKey: "outputs.actions",
      run: async () => {
        if (!state.plan) {
          throw new Error("simulate result is not available");
        }
        const actionsBase = buildActionsFromPlan({
          plan: state.plan,
          profile: input.profile,
          baseAssumptions: input.baseAssumptions,
          snapshotMeta: {
            asOf: input.snapshotAsOf,
            missing: !input.snapshotAsOf,
          },
          ...(state.monteCarloResult ? { monteCarlo: state.monteCarloResult } : {}),
        });
        state.actionsResult = input.includeProducts
          ? await input.matchCandidatesProvider(actionsBase, {
            includeProducts: true,
            requestBaseUrl: input.requestBaseUrl,
          })
          : actionsBase;
        return state.actionsResult;
      },
    },
    debtStrategy: {
      enabled: input.analyzeDebtEnabled,
      outputRefKey: "outputs.debtStrategy",
      run: () => {
        state.debtStrategyResult = computeDebtStrategy({
          liabilities: debtLiabilities,
          monthlyIncomeKrw: Math.max(
            0,
            input.profile.cashflow?.monthlyIncomeKrw ?? input.profile.monthlyIncomeNet,
          ),
          offers: input.debtStrategyInput.offers,
          options: input.debtStrategyInput.options,
          horizonMonths: input.horizonMonths,
          nowMonthIndex: 0,
        });
        return state.debtStrategyResult;
      },
    },
  };
}

export function resolvePlanningStageOutputs(
  pipeline: StagePipelineOutput,
  state: PlanningStagePlanState,
): ResolvedPlanningStageOutputs {
  return {
    simulatePlan: (state.plan ?? pipeline.outputs.simulate) as SimulationResultV2 | null,
    scenariosOutput: (state.scenariosResult ?? pipeline.outputs.scenarios) as ReturnType<typeof runScenarios> | null,
    monteCarloOutput: (state.monteCarloResult ?? pipeline.outputs.monteCarlo) as ReturnType<typeof runMonteCarlo> | null,
    actionsOutput: Array.isArray(state.actionsResult ?? pipeline.outputs.actions)
      ? (state.actionsResult ?? pipeline.outputs.actions) as ActionItemV2[]
      : null,
    debtStrategyOutput: (state.debtStrategyResult ?? pipeline.outputs.debtStrategy) as ReturnType<typeof computeDebtStrategy> | null,
  };
}
