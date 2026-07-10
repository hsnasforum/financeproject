import { getPlanningFeatureFlags } from "../config";
import {
  PlanningRunAssumptionsResolveError,
  resolvePlanningRunAssumptions,
} from "../v2/runAssumptionsRouteService";
import { checkMonteCarloBudget } from "../v2/budget";
import { matchCandidates } from "../v2/actions/matchFinlifeCandidates";
import { PlanningV2ValidationError } from "../v2/types";
import {
  createCurrentUserRunResponseData,
  getCurrentUserRunForRoute,
  getCurrentUserRunProfileForRoute,
  recordCurrentUserRunCreateAudit,
  recordCurrentUserRunStageMetrics,
  type CurrentUserRunRecord,
  type CurrentUserRunStageResult,
} from "./routeService";
import { runStagePipeline } from "../../v2/stagePipeline";
import { loadCanonicalProfile } from "../../v2/loadCanonicalProfile";
import { applyProfilePatch } from "../../v2/profilePatch";
import {
  applyScenario,
  validateScenario,
} from "../../v2/scenario";
import {
  legacyScenarioToInputScenario,
  parseRiskTolerance,
  toLegacyScenarioMetaFromInput,
  validationIssues,
  type CreatePlanningRunCommand,
  type CreatePlanningRunParseResult,
} from "./createRunCommandParser";
import {
  assemblePlanningRunRecordInput,
  buildCreatePlanningRunSuccessMeta,
  totalStageDurationMs,
} from "./createRunRecordAssembler";
import { persistCreatePlanningRunRecord } from "./createRunPersistence";
import {
  recordCreateRunAuditSafely,
  recordCreateRunStageMetricsSafely,
} from "./createRunSideEffects";
import { evaluateCreatePlanningRunPreflight } from "./createRunPreflight";
import {
  buildPlanningStagePlan,
  createPlanningStagePlanState,
  resolvePlanningStageOutputs,
} from "./createRunStagePlan";

export {
  parseCreatePlanningRunCommand,
  type CreatePlanningRunCommand,
  type CreatePlanningRunParseDependencies,
  type CreatePlanningRunParseResult,
  type RunsCreateBody,
} from "./createRunCommandParser";

export type CreatePlanningRunContext = {
  requestBaseUrl: string;
};

export type CreatePlanningRunResult =
  | {
    ok: true;
    status: number;
    payload: {
      meta: Record<string, unknown>;
      data: CurrentUserRunRecord;
    };
  }
  | {
    ok: false;
    code: string;
    message: string;
    status?: number;
    issues?: string[];
    meta?: Record<string, unknown>;
  };

export type CreatePlanningRunDependencies = {
  getFeatureFlags?: typeof getPlanningFeatureFlags;
  getProfile?: typeof getCurrentUserRunProfileForRoute;
  getRun?: typeof getCurrentUserRunForRoute;
  resolveAssumptions?: typeof resolvePlanningRunAssumptions;
  runPipeline?: typeof runStagePipeline;
  matchCandidatesProvider?: typeof matchCandidates;
  createRunRecord?: typeof createCurrentUserRunResponseData;
  recordAudit?: typeof recordCurrentUserRunCreateAudit;
  recordStageMetrics?: typeof recordCurrentUserRunStageMetrics;
  randomUUID?: () => string;
  now?: () => Date;
};

type ResolvedCreatePlanningRunDependencies = Required<CreatePlanningRunDependencies>;

function resolveCreateDependencies(
  dependencies: CreatePlanningRunDependencies = {},
): ResolvedCreatePlanningRunDependencies {
  return {
    getFeatureFlags: dependencies.getFeatureFlags ?? getPlanningFeatureFlags,
    getProfile: dependencies.getProfile ?? getCurrentUserRunProfileForRoute,
    getRun: dependencies.getRun ?? getCurrentUserRunForRoute,
    resolveAssumptions: dependencies.resolveAssumptions ?? resolvePlanningRunAssumptions,
    runPipeline: dependencies.runPipeline ?? runStagePipeline,
    matchCandidatesProvider: dependencies.matchCandidatesProvider ?? matchCandidates,
    createRunRecord: dependencies.createRunRecord ?? createCurrentUserRunResponseData,
    recordAudit: dependencies.recordAudit ?? recordCurrentUserRunCreateAudit,
    recordStageMetrics: dependencies.recordStageMetrics ?? recordCurrentUserRunStageMetrics,
    randomUUID: dependencies.randomUUID ?? (() => crypto.randomUUID()),
    now: dependencies.now ?? (() => new Date()),
  };
}

function errorResult(input: {
  code: string;
  message: string;
  status?: number;
  issues?: string[];
  meta?: Record<string, unknown>;
}): CreatePlanningRunResult {
  return {
    ok: false,
    code: input.code,
    message: input.message,
    ...(typeof input.status === "number" ? { status: input.status } : {}),
    ...(input.issues ? { issues: input.issues } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  };
}

function recordCreateAudit(
  dependencies: ResolvedCreatePlanningRunDependencies,
  input: {
    result: "SUCCESS" | "ERROR";
    recordId?: string | null;
    message: string;
  },
) {
  recordCreateRunAuditSafely(dependencies.recordAudit, {
    result: input.result,
    recordId: input.recordId,
    message: input.message,
  });
}

async function recordStageMetricsSafely(
  dependencies: ResolvedCreatePlanningRunDependencies,
  input: Parameters<typeof recordCurrentUserRunStageMetrics>[0],
) {
  await recordCreateRunStageMetricsSafely(dependencies.recordStageMetrics, input);
}

export function recordCreatePlanningRunParseFailure(
  parseFailure: Exclude<CreatePlanningRunParseResult, { ok: true }>,
  dependencies?: Pick<CreatePlanningRunDependencies, "recordAudit">,
) {
  const deps = resolveCreateDependencies(dependencies);
  recordCreateAudit(deps, {
    result: "ERROR",
    recordId: parseFailure.recordId,
    message: parseFailure.auditMessage,
  });
}

export async function createPlanningRun(
  command: CreatePlanningRunCommand,
  context: CreatePlanningRunContext,
  dependencies?: CreatePlanningRunDependencies,
): Promise<CreatePlanningRunResult> {
  const deps = resolveCreateDependencies(dependencies);
  const {
    profileId,
    runRequestId,
    title,
    horizonMonths,
    policyId,
    requestedSnapshotId,
    assumptionsOverride,
    runScenariosEnabled,
    getActionsEnabled,
    analyzeDebtEnabled,
    debtStrategyInput,
    includeProducts,
    monteCarloConfig,
  } = command;
  let scenarioInput = command.scenarioInput;
  const scenarioMeta = command.scenarioMeta;

  const featureFlags = deps.getFeatureFlags();
  if (includeProducts && !featureFlags.includeProductsEnabled) {
    recordCreateAudit(deps, {
      result: "ERROR",
      message: "includeProducts disabled by server feature flag",
    });
    return errorResult({
      code: "INPUT",
      message: "서버 설정으로 includeProducts 기능이 비활성화되어 있습니다.",
      status: 400,
    });
  }
  if (monteCarloConfig && !featureFlags.monteCarloEnabled) {
    recordCreateAudit(deps, {
      result: "ERROR",
      message: "monteCarlo disabled by server feature flag",
    });
    return errorResult({
      code: "INPUT",
      message: "서버 설정으로 Monte Carlo 기능이 비활성화되어 있습니다.",
      status: 400,
    });
  }

  const profileRecord = await deps.getProfile(profileId);
  if (!profileRecord) {
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileId,
      message: "profile not found",
    });
    return errorResult({
      code: "NO_DATA",
      message: "프로필을 찾을 수 없습니다.",
    });
  }

  const scenarioBaselineRunId = scenarioInput?.baseRunId || scenarioMeta?.baselineRunId;
  if (scenarioBaselineRunId) {
    const baselineRun = await deps.getRun(scenarioBaselineRunId);
    if (!baselineRun) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "scenario baseline run not found",
      });
      return errorResult({
        code: "INPUT",
        message: "scenario baseline runId를 찾을 수 없습니다.",
        status: 400,
        issues: [`input.scenario.baseRunId: '${scenarioBaselineRunId}' not found`],
      });
    }
  }

  if (!scenarioInput && scenarioMeta) {
    scenarioInput = legacyScenarioToInputScenario(scenarioMeta);
  }

  let canonicalProfile = profileRecord.profile;
  let profileNormalization = {
    defaultsApplied: [],
    fixesApplied: [],
  } as ReturnType<typeof loadCanonicalProfile>["normalization"];
  try {
    const canonicalLoad = loadCanonicalProfile(profileRecord.profile, {
      offers: debtStrategyInput.offers,
    });
    canonicalProfile = canonicalLoad.profile;
    profileNormalization = canonicalLoad.normalization;
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "profile canonicalization failed",
      });
      return errorResult({
        code: "INPUT",
        message: error.message,
        status: 400,
        issues: validationIssues(error),
      });
    }
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileId,
      message: "profile canonicalization failed",
    });
    return errorResult({
      code: "INTERNAL",
      message: "실행 저장 검증 중 오류가 발생했습니다.",
    });
  }

  if (scenarioInput) {
    try {
      canonicalProfile = applyProfilePatch(canonicalProfile, scenarioInput.patch);
    } catch (error) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "scenario apply failed",
      });
      if (error instanceof PlanningV2ValidationError) {
        return errorResult({
          code: "INPUT",
          message: "scenario patch 검증에 실패했습니다.",
          status: 400,
          issues: validationIssues(error),
        });
      }
      return errorResult({
        code: "INPUT",
        message: error instanceof Error ? error.message : "scenario 적용에 실패했습니다.",
        status: 400,
      });
    }
  } else if (scenarioMeta) {
    const scenarioIssues = validateScenario(canonicalProfile, scenarioMeta.patches);
    if (scenarioIssues.length > 0) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "scenario validation failed",
      });
      return errorResult({
        code: "INPUT",
        message: "scenario patch 검증에 실패했습니다.",
        status: 400,
        issues: scenarioIssues.map((issue) => `${issue.path}: ${issue.message}`),
      });
    }
    try {
      canonicalProfile = applyScenario(canonicalProfile, scenarioMeta.patches);
    } catch (error) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "scenario apply failed",
      });
      return errorResult({
        code: "INPUT",
        message: error instanceof Error ? error.message : "scenario 적용에 실패했습니다.",
        status: 400,
      });
    }
  }
  const preflight = evaluateCreatePlanningRunPreflight({
    profile: canonicalProfile,
    requestedSnapshotId,
    debtStrategyInput,
    assumptionsOverride,
    monteCarloConfig,
    horizonMonths,
  });
  if (!preflight.ok) {
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileId,
      message: `preflight blocked (${preflight.blockIssues.map((issue) => issue.code).join(", ")})`,
    });
    return errorResult({
      code: "INPUT",
      message: "실행 저장 사전 점검에 실패했습니다.",
      status: 400,
      issues: preflight.responseIssues,
      meta: preflight.meta,
    });
  }

  const riskTolerance = parseRiskTolerance(canonicalProfile as unknown);
  let assumptionsContext: Awaited<ReturnType<typeof resolvePlanningRunAssumptions>>;
  try {
    assumptionsContext = await deps.resolveAssumptions({
      profileId: profileRecord.id,
      requestedSnapshotId,
      assumptionsOverride,
      riskTolerance,
    });
  } catch (error) {
    if (error instanceof PlanningRunAssumptionsResolveError) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: error.auditMessage,
      });
      if (error.kind === "SNAPSHOT_NOT_FOUND") {
        return errorResult({
          code: "SNAPSHOT_NOT_FOUND",
          message: error.message,
          status: error.status,
          issues: error.issues,
        });
      }
      if (error.kind === "SNAPSHOT") {
        return errorResult({
          code: "SNAPSHOT",
          message: error.message,
          status: error.status,
        });
      }
      return errorResult({
        code: "INTERNAL",
        message: "저장된 가정 오버라이드 로드에 실패했습니다.",
        status: error.status,
      });
    }

    const message = error instanceof Error ? error.message : "Failed to resolve run assumptions";
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileId,
      message,
    });
    return errorResult({
      code: "INTERNAL",
      message,
      status: 500,
    });
  }

  const {
    snapshot,
    snapshotId,
    snapshotMeta,
    baseAssumptions,
    finalSimulationAssumptions,
    health,
    appliedOverrides,
  } = assumptionsContext;

  const monteCarloBudget = monteCarloConfig
    ? checkMonteCarloBudget({
      paths: monteCarloConfig.paths,
      horizonMonths,
    })
    : null;

  let stages: CurrentUserRunStageResult[] = [];

  try {
    const stagePlanState = createPlanningStagePlanState();
    const pipeline = await deps.runPipeline(buildPlanningStagePlan({
      profile: canonicalProfile,
      horizonMonths,
      policyId,
      baseAssumptions,
      finalSimulationAssumptions,
      riskTolerance,
      snapshotAsOf: snapshot?.asOf,
      runScenariosEnabled,
      getActionsEnabled,
      analyzeDebtEnabled,
      includeProducts,
      monteCarloConfig,
      monteCarloBudget,
      debtStrategyInput,
      requestBaseUrl: context.requestBaseUrl,
      matchCandidatesProvider: deps.matchCandidatesProvider,
      state: stagePlanState,
    }));

    stages = pipeline.stages;
    const stageOutputs = resolvePlanningStageOutputs(pipeline, stagePlanState);
    if (!stageOutputs.simulatePlan || pipeline.overallStatus === "FAILED") {
      await recordStageMetricsSafely(deps, {
        requestId: runRequestId,
        profileId: profileRecord.id,
        overallStatus: pipeline.overallStatus,
        stages,
        totalDurationMs: totalStageDurationMs(stages),
      });
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileRecord.id,
        message: "simulate stage failed",
      });
      return errorResult({
        code: "INTERNAL",
        message: "simulate 단계 실행에 실패했습니다.",
        status: 500,
        meta: {
          overallStatus: pipeline.overallStatus,
          stages,
        },
      });
    }

    const scenarioMetaForRecord = scenarioMeta ?? (scenarioInput ? toLegacyScenarioMetaFromInput(scenarioInput, deps) : undefined);
    const { recordInput } = assemblePlanningRunRecordInput({
      command,
      profileId: profileRecord.id,
      title,
      scenarioInput,
      scenarioMetaForRecord,
      profile: canonicalProfile,
      profileNormalization,
      snapshotId,
      snapshot,
      snapshotMeta,
      healthSummary: health.summary,
      baseAssumptions,
      appliedOverrides,
      overallStatus: pipeline.overallStatus,
      stages,
      stageOutputs: {
        ...stageOutputs,
        simulatePlan: stageOutputs.simulatePlan,
      },
    });

    const created = await persistCreatePlanningRunRecord({
      createRunRecord: deps.createRunRecord,
      recordInput,
    });
    await recordStageMetricsSafely(deps, {
      requestId: runRequestId,
      runId: created.id,
      profileId: profileRecord.id,
      overallStatus: pipeline.overallStatus,
      stages,
      totalDurationMs: totalStageDurationMs(stages),
    });

    recordCreateAudit(deps, {
      result: "SUCCESS",
      recordId: created.id,
      message: "planning run created",
    });

    return {
      ok: true,
      status: 201,
      payload: {
        meta: buildCreatePlanningRunSuccessMeta({
          generatedAt: deps.now().toISOString(),
          snapshotMeta,
          profileNormalization,
          healthSummary: health.summary,
          overallStatus: pipeline.overallStatus,
          stages,
        }),
        data: created,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 저장에 실패했습니다.";
    if (stages.length > 0) {
      await recordStageMetricsSafely(deps, {
        requestId: runRequestId,
        profileId: profileRecord.id,
        overallStatus: "FAILED",
        stages,
        totalDurationMs: totalStageDurationMs(stages),
      });
    }
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileRecord.id,
      message,
    });
    return errorResult({
      code: "INTERNAL",
      message,
      status: 500,
      meta: {
        ...(stages.length > 0 ? { stages } : {}),
      },
    });
  }
}
