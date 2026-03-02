import { append as appendAuditLog } from "../../../../../../lib/audit/auditLogStore";
import {
  assertLocalHost,
  requireCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import {
  ensureRunActionPlan,
  getRunActionProgress,
  summarizeRunActionProgress,
  updateRunActionProgress,
} from "../../../../../../lib/planning/server/store/runActionStore";
import { deleteRun, getRun, updateRun } from "../../../../../../lib/planning/server/store/runStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RunActionPatchBody = {
  csrf?: unknown;
  actionKey?: unknown;
  status?: unknown;
  note?: unknown;
};

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function withLocalWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    const csrfToken = typeof body?.csrf === "string" ? body.csrf.trim() : "";
    requireCsrf(request, { csrf: csrfToken }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function appendRunAudit(input: {
  event: "PLANNING_RUN_DELETE";
  route: string;
  result: "SUCCESS" | "ERROR";
  recordId?: string | null;
  message: string;
}) {
  try {
    appendAuditLog({
      event: input.event,
      route: input.route,
      summary: `${input.event} ${input.result}: ${input.message}`,
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

function appendTrashAudit(input: {
  result: "SUCCESS" | "ERROR" | "REJECTED";
  kind: "run";
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
        kind: input.kind,
        id: input.id,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash move audit", error);
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  try {
    const run = await getRun(id);
    if (!run) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.");
    }
    const plan = await ensureRunActionPlan(run);
    const progress = await getRunActionProgress(run.id);
    const runWithActionCenter = progress
      ? {
        ...run,
        actionCenter: {
          plan,
          progress,
        },
      }
      : run;
    if (progress) {
      await updateRun(run.id, {
        actionCenter: {
          plan,
          progress,
        },
      });
    }
    return jsonOk({ data: runWithActionCenter });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: RunActionPatchBody | null = null;
  try {
    body = (await request.json()) as RunActionPatchBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const actionKey = asString(body?.actionKey);
  const status = asString(body?.status);
  const note = body?.note === undefined ? undefined : asString(body.note);
  if (!actionKey) {
    return jsonError("INPUT", "actionKey가 필요합니다.", { status: 400 });
  }
  if (status && !(status === "todo" || status === "doing" || status === "done" || status === "snoozed")) {
    return jsonError("INPUT", "status는 todo|doing|done|snoozed 중 하나여야 합니다.", { status: 400 });
  }

  const { id } = await context.params;
  const run = await getRun(id);
  if (!run) {
    return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { status: 404 });
  }

  try {
    const plan = run.actionCenter?.plan ?? await ensureRunActionPlan(run);
    const updatedProgress = await updateRunActionProgress(run.id, {
      actionKey,
      ...(status ? { status } : {}),
      ...(note !== undefined ? { note } : {}),
    });
    await updateRun(run.id, {
      actionCenter: {
        plan,
        progress: updatedProgress,
      },
    });
    const summary = summarizeRunActionProgress(updatedProgress);
    return jsonOk({
      data: {
        progress: updatedProgress,
        completion: {
          done: summary.done,
          total: summary.total,
          pct: summary.completionPct,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 업데이트에 실패했습니다.";
    if (message === "ACTION_KEY_REQUIRED" || message === "ACTION_KEY_NOT_FOUND" || message === "ACTION_STATUS_INVALID") {
      return jsonError("INPUT", message, { status: 400 });
    }
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: { csrf?: unknown; confirmText?: unknown } | null = null;
  try {
    body = (await request.json()) as { csrf?: unknown } | null;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  const expectedConfirm = buildConfirmString("DELETE run", id);
  const confirmText = typeof body?.confirmText === "string" ? body.confirmText.trim() : "";
  if (!verifyConfirm(confirmText, expectedConfirm)) {
    const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
    appendTrashAudit({
      result: "REJECTED",
      kind: "run",
      id,
      message,
    });
    return jsonError("CONFIRM_MISMATCH", message, {
      status: 400,
      meta: { expectedConfirm },
    });
  }

  try {
    const deleted = await deleteRun(id);
    if (!deleted) {
      appendRunAudit({
        event: "PLANNING_RUN_DELETE",
        route: "/api/planning/v2/runs/[id]",
        result: "ERROR",
        recordId: id,
        message: "run not found",
      });
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.");
    }

    appendRunAudit({
      event: "PLANNING_RUN_DELETE",
      route: "/api/planning/v2/runs/[id]",
      result: "SUCCESS",
      recordId: id,
      message: "planning run deleted",
    });
    appendTrashAudit({
      result: "SUCCESS",
      kind: "run",
      id,
      message: "planning run moved to trash",
    });
    return jsonOk({ data: { id, deleted: true, softDeleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 삭제에 실패했습니다.";
    appendRunAudit({
      event: "PLANNING_RUN_DELETE",
      route: "/api/planning/v2/runs/[id]",
      result: "ERROR",
      recordId: id,
      message,
    });
    appendTrashAudit({
      result: "ERROR",
      kind: "run",
      id,
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
