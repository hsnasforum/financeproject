import {
  requireCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "../../../../../../lib/planning/api/routeAuth";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import {
  deleteCurrentUserRunToTrash,
  getCurrentUserRunDetailResponseData,
  patchCurrentUserRunActionCenter,
  recordCurrentUserRunDeleteRejected,
  type CurrentUserRunActionStatus as PlanningRunActionStatus,
} from "../../../../../../lib/planning/server/runs/routeService";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RunActionPatchBody = {
  csrf?: unknown;
  actionKey?: unknown;
  status?: unknown;
  note?: unknown;
};

function withReadGuard(request: Request) {
  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function withWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseActionStatus(value: unknown): PlanningRunActionStatus | undefined {
  const normalized = asString(value);
  if (!normalized) return undefined;
  if (normalized === "todo" || normalized === "doing" || normalized === "done" || normalized === "snoozed") {
    return normalized;
  }
  return undefined;
}

export async function GET(request: Request, context: RouteContext) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const { id } = await context.params;
  try {
    const data = await getCurrentUserRunDetailResponseData(id);
    if (!data) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { meta: userMeta });
    }
    return jsonOk({ data }, { meta: userMeta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500, meta: userMeta });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  let body: RunActionPatchBody | null = null;
  try {
    body = (await request.json()) as RunActionPatchBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const actionKey = asString(body?.actionKey);
  const statusRaw = asString(body?.status);
  const status = parseActionStatus(body?.status);
  const note = body?.note === undefined ? undefined : asString(body.note);
  if (!actionKey) {
    return jsonError("INPUT", "actionKey가 필요합니다.", { status: 400, meta: userMeta });
  }
  if (statusRaw && !status) {
    return jsonError("INPUT", "status는 todo|doing|done|snoozed 중 하나여야 합니다.", {
      status: 400,
      meta: userMeta,
    });
  }

  const { id } = await context.params;
  try {
    const result = await patchCurrentUserRunActionCenter({
      runId: id,
      patch: {
        actionKey,
        ...(status ? { status } : {}),
        ...(note !== undefined ? { note } : {}),
      },
    });
    if (!result) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { status: 404, meta: userMeta });
    }
    return jsonOk(
      {
        data: {
          progress: result.progress,
          completion: result.completion,
        },
      },
      { meta: userMeta },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 업데이트에 실패했습니다.";
    if (message === "ACTION_KEY_REQUIRED" || message === "ACTION_KEY_NOT_FOUND" || message === "ACTION_STATUS_INVALID") {
      return jsonError("INPUT", message, { status: 400, meta: userMeta });
    }
    return jsonError("INTERNAL", message, { status: 500, meta: userMeta });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  let body: { csrf?: unknown; confirmText?: unknown } | null = null;
  try {
    body = (await request.json()) as { csrf?: unknown } | null;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const { id } = await context.params;
  const expectedConfirm = buildConfirmString("DELETE run", id);
  const confirmText = typeof body?.confirmText === "string" ? body.confirmText.trim() : "";
  if (!verifyConfirm(confirmText, expectedConfirm)) {
    const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
    recordCurrentUserRunDeleteRejected({ runId: id, message });
    return jsonError("CONFIRM_MISMATCH", message, {
      status: 400,
      meta: { expectedConfirm, ...userMeta },
    });
  }

  try {
    const result = await deleteCurrentUserRunToTrash(id);
    if (!result.deleted) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { meta: userMeta });
    }

    return jsonOk({ data: { id, deleted: true, softDeleted: true } }, { meta: userMeta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 삭제에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500, meta: userMeta });
  }
}
