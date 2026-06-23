import { append as appendAuditLog } from "../../../audit/auditLogStore";
import {
  sanitizeRunBlobForResponse,
  sanitizeRunRecordForResponse,
} from "../../api/runResponseSanitizer";
import {
  deleteCurrentUserRun,
  ensureCurrentUserRunActionPlan,
  getCurrentUserRun,
  getCurrentUserRunActionProgress,
  getCurrentUserRunBlob,
  summarizeCurrentUserRunActionProgress,
  updateCurrentUserRun,
  updateCurrentUserRunActionProgress,
  type CurrentUserPlanningRunActionPlan,
  type CurrentUserPlanningRunActionProgress,
  type CurrentUserPlanningRunActionProgressSummary,
  type CurrentUserPlanningRunActionStatus,
} from "./repository";

export type CurrentUserRunActionStatus = CurrentUserPlanningRunActionStatus;

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

type RunAuditResult = "SUCCESS" | "ERROR";
type TrashMoveAuditResult = RunAuditResult | "REJECTED";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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

function logActionCenterHydrationFailure(runId: string, error: unknown) {
  console.error("[planning/runs/:id] failed to hydrate action center", {
    runId,
    message: errorMessage(error, "unknown error"),
  });
}

function logActionCenterPersistFailure(runId: string, error: unknown) {
  console.error("[planning/runs/:id] failed to persist hydrated action center", {
    runId,
    message: errorMessage(error, "unknown error"),
  });
}

export async function getCurrentUserRunDetailResponseData(runId: string): Promise<unknown | null> {
  const run = await getCurrentUserRun(runId);
  if (!run) return null;

  let runWithActionCenter = run;
  try {
    const plan = run.actionCenter?.plan ?? await ensureCurrentUserRunActionPlan(run);
    const progress = run.actionCenter?.progress ?? await getCurrentUserRunActionProgress(run.id);
    if (progress) {
      runWithActionCenter = {
        ...run,
        actionCenter: {
          plan,
          progress,
        },
      };
      if (!run.actionCenter?.plan || !run.actionCenter?.progress) {
        await updateCurrentUserRun(run.id, {
          actionCenter: {
            plan,
            progress,
          },
        }).catch((error) => {
          logActionCenterPersistFailure(run.id, error);
        });
      }
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

  const plan = run.actionCenter?.plan ?? await ensureCurrentUserRunActionPlan(run);
  const updatedProgress = await updateCurrentUserRunActionProgress(run.id, {
    actionKey: input.patch.actionKey,
    ...(input.patch.status ? { status: input.patch.status } : {}),
    ...(input.patch.note !== undefined ? { note: input.patch.note } : {}),
  });
  await updateCurrentUserRun(run.id, {
    actionCenter: {
      plan,
      progress: updatedProgress,
    },
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
  const progress = await getCurrentUserRunActionProgress(runId);
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
  return ensureCurrentUserRunActionPlan(run);
}
