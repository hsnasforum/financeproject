import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../lib/planning/api/response";
import { assertPlanningWriteGuard } from "../../../../../lib/planning/api/writeGuard";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";
import { buildConfirmString, verifyConfirm } from "../../../../../lib/ops/confirm";
import {
  deleteCurrentUserTrashItemPermanently,
  listCurrentUserTrashItems,
  recordCurrentUserTrashDeleteRejected,
  type CurrentUserTrashScope,
} from "../../../../../lib/planning/server/trash/routeService";

type DeleteTrashBody = {
  kind?: unknown;
  id?: unknown;
  confirmText?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseTrashKind(value: unknown): CurrentUserTrashScope | null {
  const raw = asString(value).toLowerCase();
  if (raw === "profiles" || raw === "runs" || raw === "reports" || raw === "all") return raw;
  return null;
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
    assertPlanningWriteGuard(request, body);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function GET(request: Request) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      try {
        const url = new URL(request.url);
        const parsedKind = parseTrashKind(url.searchParams.get("kind"));
        const kind = parsedKind ?? "all";
        const limit = Math.max(1, Math.min(200, Math.trunc(Number(url.searchParams.get("limit"))) || 100));
        const rows = await listCurrentUserTrashItems({ kind, limit });
        return jsonOk({ data: rows }, { meta: planningUserMeta(currentUser) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "휴지통 조회에 실패했습니다.";
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "휴지통 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let body: DeleteTrashBody = null;
  try {
    body = (await request.json()) as DeleteTrashBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const parsedKind = parseTrashKind(body?.kind);
      if (!parsedKind || parsedKind === "all") {
        return jsonError("INPUT", "kind는 profiles|runs|reports 중 하나여야 합니다.", {
          status: 400,
          meta: planningUserMeta(currentUser),
        });
      }
      const id = asString(body?.id);
      if (!id) {
        return jsonError("INPUT", "id는 필수입니다.", {
          status: 400,
          meta: planningUserMeta(currentUser),
        });
      }

      const expectedConfirm = buildConfirmString(`DELETE ${parsedKind}`, id);
      const confirmText = asString(body?.confirmText);
      if (!verifyConfirm(confirmText, expectedConfirm)) {
        const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
        recordCurrentUserTrashDeleteRejected({
          kind: parsedKind,
          id,
          message,
        });
        return jsonError("CONFIRM_MISMATCH", message, {
          status: 400,
          meta: { expectedConfirm, ...planningUserMeta(currentUser) },
        });
      }

      try {
        const result = await deleteCurrentUserTrashItemPermanently({ kind: parsedKind, id });
        if (!result.deleted) {
          return jsonError("NO_DATA", "휴지통 항목을 찾을 수 없습니다.", {
            status: 404,
            meta: planningUserMeta(currentUser),
          });
        }
        return jsonOk({
          data: {
            kind: parsedKind,
            id,
            deleted: true,
          },
        }, { meta: planningUserMeta(currentUser) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "휴지통 영구 삭제에 실패했습니다.";
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "휴지통 영구 삭제에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
