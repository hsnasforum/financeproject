import { append as appendAuditLog } from "../../../audit/auditLogStore";
import { appendEvent as appendOpsMetricEvent } from "../../../ops/metrics/metricsStore";
import {
  sanitizeRunBlobForResponse,
  sanitizeRunRecordForResponse,
} from "../../api/runResponseSanitizer";
import {
  createCurrentUserRun,
  deleteCurrentUserRun,
  ensureCurrentUserRunActionProgress,
  ensureCurrentUserRunActionPlan,
  getCurrentUserRun,
  hasCurrentUserRunIdReservation,
  getCurrentUserRunActionPlanSnapshot,
  getCurrentUserRunActionProgress,
  getCurrentUserRunBlob,
  getCurrentUserRunProfile,
  listCurrentUserRuns,
  summarizeCurrentUserRunActionProgressByRunId,
  summarizeCurrentUserRunActionProgress,
  updateCurrentUserRunActionProgress,
  type CurrentUserPlanningRunRecord,
  type CurrentUserPlanningRunActionPlan,
  type CurrentUserPlanningRunActionProgress,
  type CurrentUserPlanningRunActionProgressSummary,
  type CurrentUserPlanningRunActionStatus,
  type CurrentUserPlanningRunStageResult,
} from "./repository";
import { type CurrentUserPlanningProfileRecord } from "../profiles/repository";

export type CurrentUserRunActionStatus = CurrentUserPlanningRunActionStatus;
export type CurrentUserRunRecord = CurrentUserPlanningRunRecord;
export type CurrentUserRunStageResult = CurrentUserPlanningRunStageResult;

export type CurrentUserRunActionCenterPatchInput = {
  actionKey: string;
  status?: CurrentUserRunActionStatus;
  note?: string;
};

export type CurrentUserRunActionCenterPatchResult = {
  progress: CurrentUserPlanningRunActionProgress;
  completion: {
    done: number;
    total: number;
    pct: number;
  };
};

export type CurrentUserRunActionProgressResult = {
  progress: CurrentUserPlanningRunActionProgress;
  summary: CurrentUserPlanningRunActionProgressSummary;
};

export type CurrentUserRunBlobResponseData = unknown;

export async function hasCurrentUserRunIdReservationForRoute(runId: string): Promise<boolean> {
  return hasCurrentUserRunIdReservation(runId);
}

type RunAuditResult = "SUCCESS" | "ERROR";
type TrashMoveAuditResult = RunAuditResult | "REJECTED";
type CreateCurrentUserRunInput = Parameters<typeof createCurrentUserRun>[0];
type CreateCurrentUserRunOptions = Parameters<typeof createCurrentUserRun>[1];

export type CurrentUserRunListResponseData = {
  runs: CurrentUserRunRecord[];
  actionProgressSummaryByRunId: Record<string, CurrentUserPlanningRunActionProgressSummary>;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function recordCurrentUserRunCreateAudit(input: {
  result: RunAuditResult;
  recordId?: string | null;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      summary: `PLANNING_RUN_CREATE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        recordId: input.recordId ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning run audit", error);
  }
}

function appendRunDeleteAudit(input: {
  result: RunAuditResult;
  recordId?: string | null;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_RUN_DELETE",
      route: "/api/planning/v2/runs/[id]",
      summary: `PLANNING_RUN_DELETE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        recordId: input.recordId ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning run audit", error);
  }
}

function appendTrashMoveAudit(input: {
  result: TrashMoveAuditResult;
  id: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_MOVE",
      route: "/api/planning/v2/runs/[id]",
      summary: `PLANNING_TRASH_MOVE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: "run",
        id: input.id,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash move audit", error);
  }
}

export async function recordCurrentUserRunStageMetrics(input: {
  requestId: string;
  runId?: string;
  profileId: string;
  overallStatus: string;
  stages: CurrentUserRunStageResult[];
  totalDurationMs?: number;
}) {
  const tasks = input.stages.map((stage) => appendOpsMetricEvent({
    type: "RUN_STAGE",
    status: stage.status,
    ...(input.runId ? { runId: input.runId } : {}),
    stage: stage.id,
    ...(typeof stage.durationMs === "number" ? { durationMs: stage.durationMs } : {}),
    ...(stage.reason ? { errorCode: stage.reason } : {}),
  }));
  tasks.push(appendOpsMetricEvent({
    type: "RUN_PIPELINE",
    status: input.overallStatus,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(typeof input.totalDurationMs === "number" ? { durationMs: input.totalDurationMs } : {}),
  }));
  await Promise.allSettled(tasks);
}

function logActionCenterHydrationFailure(runId: string, error: unknown) {
  console.error("[planning/runs/:id] failed to hydrate action center", {
    runId,
    message: errorMessage(error, "unknown error"),
  });
}

export async function listCurrentUserRunsForRoute(options?: {
  profileId?: string;
  limit?: number;
  offset?: number;
}): Promise<CurrentUserRunListResponseData> {
  const runs = await listCurrentUserRuns(options);
  const sanitizedRuns = runs.map((run) => sanitizeRunRecordForResponse(run));
  const actionProgressSummaryByRunId = await summarizeCurrentUserRunActionProgressByRunId(sanitizedRuns);

  return {
    runs: sanitizedRuns,
    actionProgressSummaryByRunId,
  };
}

export async function getCurrentUserRunProfileForRoute(
  profileId: string,
): Promise<CurrentUserPlanningProfileRecord | null> {
  return getCurrentUserRunProfile(profileId);
}

export async function getCurrentUserRunForRoute(runId: string): Promise<CurrentUserRunRecord | null> {
  return getCurrentUserRun(runId);
}

export async function createCurrentUserRunResponseData(
  input: CreateCurrentUserRunInput,
  options?: CreateCurrentUserRunOptions,
): Promise<CurrentUserRunRecord> {
  const created = await createCurrentUserRun(input, options);
  try {
    const plan = await ensureCurrentUserRunActionPlan(created);
    await ensureCurrentUserRunActionProgress(created, plan);
  } catch (error) {
    console.error("[planning] failed to initialize action center", error);
  }
  return sanitizeRunRecordForResponse(created);
}

export async function getCurrentUserRunDetailResponseData(runId: string): Promise<unknown | null> {
  const run = await getCurrentUserRun(runId);
  if (!run) return null;

  let runWithActionCenter = run;
  try {
    const embeddedActionCenter = run.actionCenter;
    const plan = await getCurrentUserRunActionPlanSnapshot(run.id).catch((error) => {
      logActionCenterHydrationFailure(run.id, error);
      return null;
    }) ?? embeddedActionCenter?.plan ?? null;
    const progress = await getCurrentUserRunActionProgress(run.id).catch((error) => {
      logActionCenterHydrationFailure(run.id, error);
      return null;
    }) ?? embeddedActionCenter?.progress ?? null;
    if (plan && progress) {
      runWithActionCenter = {
        ...run,
        actionCenter: {
          plan,
          progress,
        },
      };
    }
  } catch (error) {
    logActionCenterHydrationFailure(run.id, error);
  }

  return sanitizeRunRecordForResponse(runWithActionCenter);
}

export async function getCurrentUserRunBlobResponseData(
  runId: string,
  name: string,
): Promise<CurrentUserRunBlobResponseData | null> {
  const blob = await getCurrentUserRunBlob(runId, name);
  if (blob === null) return null;
  return sanitizeRunBlobForResponse(blob);
}

export async function patchCurrentUserRunActionCenter(input: {
  runId: string;
  patch: CurrentUserRunActionCenterPatchInput;
}): Promise<CurrentUserRunActionCenterPatchResult | null> {
  const run = await getCurrentUserRun(input.runId);
  if (!run) return null;

  await ensureCurrentUserRunActionPlan(run);
  const updatedProgress = await updateCurrentUserRunActionProgress(run.id, {
    actionKey: input.patch.actionKey,
    ...(input.patch.status ? { status: input.patch.status } : {}),
    ...(input.patch.note !== undefined ? { note: input.patch.note } : {}),
  });
  const summary = summarizeCurrentUserRunActionProgress(updatedProgress);
  return {
    progress: updatedProgress,
    completion: {
      done: summary.done,
      total: summary.total,
      pct: summary.completionPct,
    },
  };
}

export async function getCurrentUserRunActionProgressResult(
  runId: string,
): Promise<CurrentUserRunActionProgressResult | null> {
  const run = await getCurrentUserRun(runId);
  if (!run) return null;
  const progress = await getCurrentUserRunActionProgress(run.id) ?? run.actionCenter?.progress ?? null;
  if (!progress) return null;
  return {
    progress,
    summary: summarizeCurrentUserRunActionProgress(progress),
  };
}

export async function patchCurrentUserRunActionProgress(input: {
  runId: string;
  patch: CurrentUserRunActionCenterPatchInput;
}): Promise<CurrentUserRunActionProgressResult> {
  const progress = await updateCurrentUserRunActionProgress(input.runId, {
    actionKey: input.patch.actionKey,
    ...(input.patch.status ? { status: input.patch.status } : {}),
    ...(input.patch.note !== undefined ? { note: input.patch.note } : {}),
  });
  return {
    progress,
    summary: summarizeCurrentUserRunActionProgress(progress),
  };
}

export function recordCurrentUserRunDeleteRejected(input: {
  runId: string;
  message: string;
}): void {
  appendTrashMoveAudit({
    result: "REJECTED",
    id: input.runId,
    message: input.message,
  });
}

export async function deleteCurrentUserRunToTrash(runId: string): Promise<{ deleted: boolean }> {
  try {
    const deleted = await deleteCurrentUserRun(runId);
    if (!deleted) {
      appendRunDeleteAudit({
        result: "ERROR",
        recordId: runId,
        message: "run not found",
      });
      return { deleted: false };
    }

    appendRunDeleteAudit({
      result: "SUCCESS",
      recordId: runId,
      message: "planning run deleted",
    });
    appendTrashMoveAudit({
      result: "SUCCESS",
      id: runId,
      message: "planning run moved to trash",
    });
    return { deleted: true };
  } catch (error) {
    const message = errorMessage(error, "실행 기록 삭제에 실패했습니다.");
    appendRunDeleteAudit({
      result: "ERROR",
      recordId: runId,
      message,
    });
    appendTrashMoveAudit({
      result: "ERROR",
      id: runId,
      message,
    });
    throw error;
  }
}

export async function getCurrentUserRunActionPlan(
  runId: string,
): Promise<CurrentUserPlanningRunActionPlan | null> {
  const run = await getCurrentUserRun(runId);
  if (!run) return null;
  const embeddedPlan = run.actionCenter ? run.actionCenter.plan : null;
  return await getCurrentUserRunActionPlanSnapshot(run.id) ?? embeddedPlan;
}
