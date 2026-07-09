import {
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import { assertPlanningWriteGuard } from "../../../../../../lib/planning/api/writeGuard";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../../lib/planning/api/routeAuth";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import {
  emptyCurrentUserTrashItems,
  recordCurrentUserTrashEmptyRejected,
  type CurrentUserTrashScope,
} from "../../../../../../lib/planning/server/trash/routeService";

type EmptyTrashBody = {
  kind?: unknown;
  confirmText?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseTrashKind(value: unknown): CurrentUserTrashScope {
  const raw = asString(value).toLowerCase();
  if (raw === "profiles" || raw === "runs" || raw === "reports" || raw === "all") return raw;
  return "all";
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

export async function POST(request: Request) {
  let body: EmptyTrashBody = null;
  try {
    body = (await request.json()) as EmptyTrashBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const kind = parseTrashKind(body?.kind);
      const expectedConfirm = buildConfirmString("EMPTY_TRASH", kind);
      const confirmText = asString(body?.confirmText);
      if (!verifyConfirm(confirmText, expectedConfirm)) {
        const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
        recordCurrentUserTrashEmptyRejected({
          kind,
          message,
        });
        return jsonError("CONFIRM_MISMATCH", message, {
          status: 400,
          meta: { expectedConfirm, ...planningUserMeta(currentUser) },
        });
      }

      try {
        const applied = await emptyCurrentUserTrashItems({ kind });
        return jsonOk({
          data: {
            kind,
            deleted: applied.deleted,
          },
        }, { meta: planningUserMeta(currentUser) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "휴지통 비우기에 실패했습니다.";
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "휴지통 비우기에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
