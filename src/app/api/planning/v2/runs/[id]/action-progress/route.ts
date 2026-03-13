import {
  requireCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../../lib/planning/api/response";
import {
  getRunActionProgress,
  summarizeRunActionProgress,
  updateRunActionProgress,
} from "../../../../../../../lib/planning/server/store/runActionStore";
import { type PlanningRunActionStatus } from "../../../../../../../lib/planning/server/store/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ActionProgressPatchBody = {
  csrf?: unknown;
  actionKey?: unknown;
  status?: unknown;
  note?: unknown;
} | null;

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

export async function GET(request: Request, context: RouteContext) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  try {
    const progress = await getRunActionProgress(id);
    if (!progress) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { status: 404 });
    }
    return jsonOk({
      data: progress,
      meta: {
        summary: summarizeRunActionProgress(progress),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "action-progress 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  let body: ActionProgressPatchBody = null;
  try {
    body = (await request.json()) as ActionProgressPatchBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const actionKey = asString(body?.actionKey);
  const statusRaw = asString(body?.status);
  const status = parseActionStatus(body?.status);
  const note = body?.note === undefined ? undefined : asString(body.note);
  if (!actionKey) {
    return jsonError("INPUT", "actionKey가 필요합니다.", { status: 400 });
  }
  if (statusRaw && !status) {
    return jsonError("INPUT", "status는 todo|doing|done|snoozed 중 하나여야 합니다.", { status: 400 });
  }

  const { id } = await context.params;
  try {
    const updated = await updateRunActionProgress(id, {
      actionKey,
      ...(status ? { status } : {}),
      ...(note !== undefined ? { note } : {}),
    });
    return jsonOk({
      data: updated,
      meta: {
        summary: summarizeRunActionProgress(updated),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "action-progress 업데이트에 실패했습니다.";
    if (message === "RUN_NOT_FOUND") {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { status: 404 });
    }
    if (message === "ACTION_KEY_REQUIRED" || message === "ACTION_KEY_NOT_FOUND" || message === "ACTION_STATUS_INVALID") {
      return jsonError("INPUT", message, { status: 400 });
    }
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
