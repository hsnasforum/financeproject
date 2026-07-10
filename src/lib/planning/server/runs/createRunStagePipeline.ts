import { matchCandidates } from "../v2/actions/matchFinlifeCandidates";
import { checkMonteCarloBudget } from "../v2/budget";
import { runStagePipeline, type StagePipelineOutput } from "../../v2/stagePipeline";
import { type CreatePlanningRunCommand } from "./createRunCommandParser";
import {
  buildPlanningStagePlan,
  createPlanningStagePlanState,
  resolvePlanningStageOutputs,
  type ResolvedPlanningStageOutputs,
} from "./createRunStagePlan";
import { type CurrentUserRunStageResult } from "./routeService";

type StagePlanInput = Parameters<typeof buildPlanningStagePlan>[0];

export type CreatePlanningRunStagePipelineDependencies = {
  runPipeline: typeof runStagePipeline;
  matchCandidatesProvider: typeof matchCandidates;
};

export const defaultCreatePlanningRunStagePipelineDependencies: CreatePlanningRunStagePipelineDependencies = {
  runPipeline: runStagePipeline,
  matchCandidatesProvider: matchCandidates,
};

export type CreatePlanningRunStagePipelineInput = {
  command: CreatePlanningRunCommand;
  profile: StagePlanInput["profile"];
  baseAssumptions: StagePlanInput["baseAssumptions"];
  finalSimulationAssumptions: StagePlanInput["finalSimulationAssumptions"];
  riskTolerance: StagePlanInput["riskTolerance"];
  snapshotAsOf?: string;
  requestBaseUrl: string;
  dependencies: CreatePlanningRunStagePipelineDependencies;
};

export type CreatePlanningRunStagePipelineResult = {
  pipeline: StagePipelineOutput;
  stages: CurrentUserRunStageResult[];
  stageOutputs: ResolvedPlanningStageOutputs;
};

export class CreatePlanningRunStageOutputResolutionError extends Error {
  readonly stages: CurrentUserRunStageResult[];

  constructor(error: unknown, stages: CurrentUserRunStageResult[]) {
    super(error instanceof Error ? error.message : "실행 기록 저장에 실패했습니다.");
    this.name = "CreatePlanningRunStageOutputResolutionError";
    this.stages = stages;
  }
}

export async function runCreatePlanningRunStagePipeline(
  input: CreatePlanningRunStagePipelineInput,
): Promise<CreatePlanningRunStagePipelineResult> {
  const { command, dependencies } = input;
  const monteCarloBudget = command.monteCarloConfig
    ? checkMonteCarloBudget({
      paths: command.monteCarloConfig.paths,
      horizonMonths: command.horizonMonths,
    })
    : null;
  const stagePlanState = createPlanningStagePlanState();
  const pipeline = await dependencies.runPipeline(buildPlanningStagePlan({
    profile: input.profile,
    horizonMonths: command.horizonMonths,
    policyId: command.policyId,
    baseAssumptions: input.baseAssumptions,
    finalSimulationAssumptions: input.finalSimulationAssumptions,
    riskTolerance: input.riskTolerance,
    snapshotAsOf: input.snapshotAsOf,
    runScenariosEnabled: command.runScenariosEnabled,
    getActionsEnabled: command.getActionsEnabled,
    analyzeDebtEnabled: command.analyzeDebtEnabled,
    includeProducts: command.includeProducts,
    monteCarloConfig: command.monteCarloConfig,
    monteCarloBudget,
    debtStrategyInput: command.debtStrategyInput,
    requestBaseUrl: input.requestBaseUrl,
    matchCandidatesProvider: dependencies.matchCandidatesProvider,
    state: stagePlanState,
  }));
  let stageOutputs: ResolvedPlanningStageOutputs;
  try {
    stageOutputs = resolvePlanningStageOutputs(pipeline, stagePlanState);
  } catch (error) {
    throw new CreatePlanningRunStageOutputResolutionError(error, pipeline.stages);
  }
  return {
    pipeline,
    stages: pipeline.stages,
    stageOutputs,
  };
}
