import { getPlanningFeatureFlags } from "../config";
import { sanitizeRunRecordForResponse } from "../../api/runResponseSanitizer";
import { resolvePlanningRunAssumptions } from "../v2/runAssumptionsRouteService";
import {
  createCurrentUserRunResponseData,
  getCurrentUserRunForRoute,
  getCurrentUserRunProfileForRoute,
  hasCurrentUserRunIdReservationForRoute,
  recordCurrentUserRunCreateAudit,
  recordCurrentUserRunStageMetrics,
  type CurrentUserRunStageResult,
} from "./routeService";
import {
  toLegacyScenarioMetaFromInput,
  type CreatePlanningRunCommand,
  type CreatePlanningRunParseResult,
} from "./createRunCommandParser";
import { prepareCreatePlanningRunInputContext } from "./createRunInputContext";
import {
  assemblePlanningRunRecordInput,
  buildCreatePlanningRunSuccessMeta,
  totalStageDurationMs,
} from "./createRunRecordAssembler";
import {
  type PlanningRunIdempotencyContext,
  withPlanningRunIdempotency,
} from "./createRunIdempotency";
import { persistCreatePlanningRunRecord } from "./createRunPersistence";
import {
  recordCreateRunFailureAudit,
  recordCreateRunFailureSideEffects,
  recordCreateRunSuccessSideEffects,
} from "./createRunSideEffects";
import {
  buildCreatePlanningRunSuccessResult,
  type CreatePlanningRunSuccessResult,
} from "./createRunSuccessResponse";
import {
  CreatePlanningRunStageOutputResolutionError,
  defaultCreatePlanningRunStagePipelineDependencies,
  runCreatePlanningRunStagePipeline,
  type CreatePlanningRunStagePipelineDependencies,
} from "./createRunStagePipeline";

export {
  parseCreatePlanningRunCommand,
  type CreatePlanningRunCommand,
  type CreatePlanningRunParseDependencies,
  type CreatePlanningRunParseResult,
  type RunsCreateBody,
} from "./createRunCommandParser";

export type CreatePlanningRunContext = {
  requestBaseUrl: string;
  idempotency?: PlanningRunIdempotencyContext;
};

export type CreatePlanningRunResult =
  | CreatePlanningRunSuccessResult
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
  hasRunIdReservation?: typeof hasCurrentUserRunIdReservationForRoute;
  resolveAssumptions?: typeof resolvePlanningRunAssumptions;
  runPipeline?: CreatePlanningRunStagePipelineDependencies["runPipeline"];
  matchCandidatesProvider?: CreatePlanningRunStagePipelineDependencies["matchCandidatesProvider"];
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
  const stagePipelineDependencies = defaultCreatePlanningRunStagePipelineDependencies;
  return {
    getFeatureFlags: dependencies.getFeatureFlags ?? getPlanningFeatureFlags,
    getProfile: dependencies.getProfile ?? getCurrentUserRunProfileForRoute,
    getRun: dependencies.getRun ?? getCurrentUserRunForRoute,
    hasRunIdReservation: dependencies.hasRunIdReservation ?? hasCurrentUserRunIdReservationForRoute,
    resolveAssumptions: dependencies.resolveAssumptions ?? resolvePlanningRunAssumptions,
    runPipeline: dependencies.runPipeline ?? stagePipelineDependencies.runPipeline,
    matchCandidatesProvider: dependencies.matchCandidatesProvider ?? stagePipelineDependencies.matchCandidatesProvider,
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

export function recordCreatePlanningRunParseFailure(
  parseFailure: Exclude<CreatePlanningRunParseResult, { ok: true }>,
  dependencies?: Pick<CreatePlanningRunDependencies, "recordAudit">,
) {
  const deps = resolveCreateDependencies(dependencies);
  recordCreateRunFailureAudit({
    recordAudit: deps.recordAudit,
    recordId: parseFailure.recordId,
    message: parseFailure.auditMessage,
  });
}

async function createPlanningRunOnce(
  command: CreatePlanningRunCommand,
  context: CreatePlanningRunContext,
  dependencies?: CreatePlanningRunDependencies,
): Promise<CreatePlanningRunResult> {
  const deps = resolveCreateDependencies(dependencies);
  const {
    runRequestId,
    title,
    includeProducts,
    monteCarloConfig,
  } = command;
  const scenarioMeta = command.scenarioMeta;

  if (context.idempotency) {
    try {
      const existing = await deps.getRun(context.idempotency.runId);
      if (existing) {
        const storedIdempotency = existing.meta.idempotency;
        const matchesRequest = storedIdempotency?.version === 1
          && storedIdempotency.keyHash === context.idempotency.keyHash
          && storedIdempotency.requestFingerprint === context.idempotency.requestFingerprint;
        if (!matchesRequest) {
          recordCreateRunFailureAudit({
            recordAudit: deps.recordAudit,
            recordId: existing.id,
            message: "idempotency key reused with a different planning run request",
          });
          return errorResult({
            code: "IDEMPOTENCY_CONFLICT",
            message: "동일한 Idempotency-Key가 다른 플래닝 실행 요청에 이미 사용되었습니다.",
            status: 409,
          });
        }
        return {
          ok: true,
          status: 201,
          payload: {
            meta: storedIdempotency.responseMeta,
            data: sanitizeRunRecordForResponse(existing),
          },
        };
      }
      if (await deps.hasRunIdReservation(context.idempotency.runId)) {
        recordCreateRunFailureAudit({
          recordAudit: deps.recordAudit,
          recordId: context.idempotency.runId,
          message: "idempotency run target is reserved but unavailable for replay",
        });
        return errorResult({
          code: "IDEMPOTENCY_CONFLICT",
          message: "동일한 Idempotency-Key의 기존 실행 기록이 삭제되었거나 읽을 수 없어 재생성하지 않았습니다.",
          status: 409,
        });
      }
    } catch (error) {
      const auditMessage = error instanceof Error ? error.message : "idempotency replay lookup failed";
      recordCreateRunFailureAudit({
        recordAudit: deps.recordAudit,
        recordId: context.idempotency.runId,
        message: auditMessage,
      });
      return errorResult({
        code: "INTERNAL",
        message: "실행 기록 재시도 상태를 확인하지 못했습니다.",
        status: 500,
      });
    }
  }

  const featureFlags = deps.getFeatureFlags();
  if (includeProducts && !featureFlags.includeProductsEnabled) {
    recordCreateRunFailureAudit({
      recordAudit: deps.recordAudit,
      message: "includeProducts disabled by server feature flag",
    });
    return errorResult({
      code: "INPUT",
      message: "서버 설정으로 includeProducts 기능이 비활성화되어 있습니다.",
      status: 400,
    });
  }
  if (monteCarloConfig && !featureFlags.monteCarloEnabled) {
    recordCreateRunFailureAudit({
      recordAudit: deps.recordAudit,
      message: "monteCarlo disabled by server feature flag",
    });
    return errorResult({
      code: "INPUT",
      message: "서버 설정으로 Monte Carlo 기능이 비활성화되어 있습니다.",
      status: 400,
    });
  }

  const inputContext = await prepareCreatePlanningRunInputContext({
    command,
    dependencies: deps,
  });
  if (!inputContext.ok) {
    recordCreateRunFailureAudit({
      recordAudit: deps.recordAudit,
      recordId: inputContext.audit.recordId,
      message: inputContext.audit.message,
    });
    return errorResult({
      ...inputContext.error,
    });
  }

  const {
    profileRecord,
    canonicalProfile,
    profileNormalization,
    scenarioInput,
    riskTolerance,
    assumptionsContext,
  } = inputContext;
  const {
    snapshot,
    snapshotId,
    snapshotMeta,
    baseAssumptions,
    finalSimulationAssumptions,
    health,
    appliedOverrides,
  } = assumptionsContext;

  let stages: CurrentUserRunStageResult[] = [];

  try {
    const stagePipelineResult = await runCreatePlanningRunStagePipeline({
      command,
      profile: canonicalProfile,
      baseAssumptions,
      finalSimulationAssumptions,
      riskTolerance,
      snapshotAsOf: snapshot?.asOf,
      requestBaseUrl: context.requestBaseUrl,
      dependencies: {
        runPipeline: deps.runPipeline,
        matchCandidatesProvider: deps.matchCandidatesProvider,
      },
    });
    const { pipeline, stageOutputs } = stagePipelineResult;
    stages = stagePipelineResult.stages;
    if (!stageOutputs.simulatePlan || pipeline.overallStatus === "FAILED") {
      await recordCreateRunFailureSideEffects({
        recordAudit: deps.recordAudit,
        recordStageMetrics: deps.recordStageMetrics,
        recordId: profileRecord.id,
        auditMessage: "simulate stage failed",
        stageMetrics: {
          requestId: runRequestId,
          profileId: profileRecord.id,
          overallStatus: pipeline.overallStatus,
          stages,
          totalDurationMs: totalStageDurationMs(stages),
        },
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
    const generatedAt = deps.now().toISOString();
    const responseMeta = buildCreatePlanningRunSuccessMeta({
      generatedAt,
      snapshotMeta,
      profileNormalization,
      healthSummary: health.summary,
      overallStatus: pipeline.overallStatus,
      stages,
    });
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
      ...(context.idempotency
        ? {
          idempotency: {
            runId: context.idempotency.runId,
            meta: {
              version: 1,
              keyHash: context.idempotency.keyHash,
              requestFingerprint: context.idempotency.requestFingerprint,
              responseMeta,
            },
          },
        }
        : {}),
    });

    const created = await persistCreatePlanningRunRecord({
      createRunRecord: deps.createRunRecord,
      recordInput,
    });
    await recordCreateRunSuccessSideEffects({
      recordAudit: deps.recordAudit,
      recordStageMetrics: deps.recordStageMetrics,
      recordId: created.id,
      stageMetrics: {
        requestId: runRequestId,
        runId: created.id,
        profileId: profileRecord.id,
        overallStatus: pipeline.overallStatus,
        stages,
        totalDurationMs: totalStageDurationMs(stages),
      },
    });

    return buildCreatePlanningRunSuccessResult({
      generatedAt,
      snapshotMeta,
      profileNormalization,
      healthSummary: health.summary,
      overallStatus: pipeline.overallStatus,
      stages,
      data: created,
    });
  } catch (error) {
    if (error instanceof CreatePlanningRunStageOutputResolutionError) {
      stages = error.stages;
    }
    const message = error instanceof Error ? error.message : "실행 기록 저장에 실패했습니다.";
    const failureStageMetrics = stages.length > 0
      ? {
        requestId: runRequestId,
        profileId: profileRecord.id,
        overallStatus: "FAILED",
        stages,
        totalDurationMs: totalStageDurationMs(stages),
      } satisfies Parameters<typeof recordCurrentUserRunStageMetrics>[0]
      : undefined;
    await recordCreateRunFailureSideEffects({
      recordAudit: deps.recordAudit,
      recordStageMetrics: deps.recordStageMetrics,
      recordId: profileRecord.id,
      auditMessage: message,
      ...(failureStageMetrics ? { stageMetrics: failureStageMetrics } : {}),
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

export async function createPlanningRun(
  command: CreatePlanningRunCommand,
  context: CreatePlanningRunContext,
  dependencies?: CreatePlanningRunDependencies,
): Promise<CreatePlanningRunResult> {
  if (!context.idempotency) {
    return createPlanningRunOnce(command, context, dependencies);
  }
  return withPlanningRunIdempotency(
    context.idempotency,
    () => createPlanningRunOnce(command, context, dependencies),
    () => errorResult({
      code: "IDEMPOTENCY_CONFLICT",
      message: "동일한 Idempotency-Key가 다른 플래닝 실행 요청에 사용 중입니다.",
      status: 409,
    }),
  );
}
