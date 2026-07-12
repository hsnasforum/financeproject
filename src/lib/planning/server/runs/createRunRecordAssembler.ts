import { DEFAULT_PLANNING_POLICY } from "../../catalog/planningPolicy";
import { type CanonicalProfileLoadResult } from "../../v2/loadCanonicalProfile";
import { buildRunReproducibilityMeta, type BuildRunReproducibilityInput } from "../../v2/reproducibility";
import { buildPlanningRunArtifacts, type PlanningRunArtifacts } from "../v2/runArtifacts";
import { type AssumptionsV2 } from "../v2/scenarios";
import { type ProfileV2 } from "../v2/types";
import {
  type createCurrentUserRunResponseData,
  type CurrentUserRunRecord,
  type CurrentUserRunStageResult,
} from "./routeService";
import { type CreatePlanningRunCommand, type RunInputScenario } from "./createRunCommandParser";
import { type StoredPlanningRunIdempotencyMeta } from "./createRunIdempotency";
import { type ResolvedPlanningStageOutputs } from "./createRunStagePlan";

type CreateRunRecordInput = Parameters<typeof createCurrentUserRunResponseData>[0];
type ArtifactInput = Parameters<typeof buildPlanningRunArtifacts>[0];

export type AssemblePlanningRunRecordInput = {
  command: CreatePlanningRunCommand;
  profileId: string;
  title: string;
  scenarioInput?: RunInputScenario;
  scenarioMetaForRecord?: NonNullable<CreatePlanningRunCommand["scenarioMeta"]>;
  profile: ProfileV2;
  profileNormalization: CanonicalProfileLoadResult["normalization"];
  snapshotId?: string;
  snapshot: BuildRunReproducibilityInput["assumptionsSnapshot"];
  snapshotMeta: ArtifactInput["snapshotMeta"];
  healthSummary: ArtifactInput["healthSummary"];
  baseAssumptions: BuildRunReproducibilityInput["effectiveAssumptions"];
  appliedOverrides: BuildRunReproducibilityInput["appliedOverrides"];
  overallStatus: CurrentUserRunRecord["overallStatus"];
  stages: CurrentUserRunStageResult[];
  stageOutputs: ResolvedPlanningStageOutputs;
  idempotency?: {
    runId: string;
    meta: StoredPlanningRunIdempotencyMeta;
  };
};

export type AssemblePlanningRunRecordResult = {
  recordInput: CreateRunRecordInput;
  outputs: PlanningRunArtifacts["outputs"];
  resultDto: PlanningRunArtifacts["resultDto"];
  reproducibility: NonNullable<CurrentUserRunRecord["reproducibility"]>;
};

export function totalStageDurationMs(stages: CurrentUserRunStageResult[]): number {
  return stages.reduce((sum, stage) => sum + (typeof stage.durationMs === "number" ? stage.durationMs : 0), 0);
}

export function assemblePlanningRunRecordInput(
  input: AssemblePlanningRunRecordInput,
): AssemblePlanningRunRecordResult {
  const {
    command,
    profile,
    stageOutputs,
  } = input;
  if (!stageOutputs.simulatePlan) {
    throw new Error("simulate output is required before assembling a planning run record");
  }
  const { outputs, resultDto } = buildPlanningRunArtifacts({
    profile,
    policyId: command.policyId,
    snapshotMeta: input.snapshotMeta,
    healthSummary: input.healthSummary,
    simulatePlan: stageOutputs.simulatePlan,
    scenariosOutput: stageOutputs.scenariosOutput,
    monteCarloOutput: stageOutputs.monteCarloOutput,
    actionsOutput: stageOutputs.actionsOutput,
    debtStrategyOutput: stageOutputs.debtStrategyOutput,
  });
  const reproducibility = buildRunReproducibilityMeta({
    profile,
    assumptionsSnapshotId: input.snapshotId,
    assumptionsSnapshot: input.snapshot,
    effectiveAssumptions: input.baseAssumptions,
    appliedOverrides: input.appliedOverrides,
    policy: DEFAULT_PLANNING_POLICY,
  });

  return {
    recordInput: {
      ...(input.idempotency ? { id: input.idempotency.runId } : {}),
      profileId: input.profileId,
      ...(input.title ? { title: input.title } : {}),
      ...(input.scenarioMetaForRecord ? { scenario: input.scenarioMetaForRecord } : {}),
      overallStatus: input.overallStatus,
      stages: input.stages,
      input: {
        horizonMonths: command.horizonMonths,
        policyId: command.policyId,
        ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
        ...(Object.keys(command.assumptionsOverride).length > 0
          ? { assumptionsOverride: command.assumptionsOverride as Partial<AssumptionsV2> }
          : {}),
        ...(command.runScenariosEnabled !== true ? { runScenarios: command.runScenariosEnabled } : {}),
        ...(command.getActionsEnabled !== true ? { getActions: command.getActionsEnabled } : {}),
        ...(command.analyzeDebtEnabled !== true ? { analyzeDebt: command.analyzeDebtEnabled } : {}),
        ...(command.debtStrategyInput.offers.length > 0 || command.debtStrategyInput.options
          ? { debtStrategy: command.debtStrategyInput }
          : {}),
        ...(command.includeProducts ? { includeProducts: true } : {}),
        ...(command.monteCarloConfig ? { monteCarlo: command.monteCarloConfig } : {}),
        ...(input.scenarioInput ? { scenario: input.scenarioInput } : {}),
      },
      meta: {
        snapshot: input.snapshotMeta,
        normalization: input.profileNormalization,
        health: {
          warningsCodes: input.healthSummary.warningCodes ?? [],
          criticalCount: input.healthSummary.criticalCount ?? 0,
          ...(typeof input.healthSummary.snapshotStaleDays === "number"
            ? { snapshotStaleDays: input.healthSummary.snapshotStaleDays }
            : {}),
        },
        ...(input.idempotency ? { idempotency: input.idempotency.meta } : {}),
      },
      reproducibility,
      outputs: {
        resultDto,
        ...outputs,
      } as unknown as CurrentUserRunRecord["outputs"],
    },
    outputs,
    resultDto,
    reproducibility,
  };
}

export function buildCreatePlanningRunSuccessMeta(input: {
  generatedAt: string;
  snapshotMeta: ArtifactInput["snapshotMeta"];
  profileNormalization: CanonicalProfileLoadResult["normalization"];
  healthSummary: ArtifactInput["healthSummary"];
  overallStatus: CurrentUserRunRecord["overallStatus"];
  stages: CurrentUserRunStageResult[];
}): Record<string, unknown> {
  return {
    generatedAt: input.generatedAt,
    snapshot: input.snapshotMeta,
    normalization: input.profileNormalization,
    health: input.healthSummary,
    overallStatus: input.overallStatus,
    stages: input.stages,
  };
}
