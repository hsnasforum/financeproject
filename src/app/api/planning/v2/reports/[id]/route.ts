import {
  assertCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../../lib/planning/api/routeAuth";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import {
  deleteCurrentUserReportToTrash,
  getCurrentUserReportDetailResponseData,
  recordCurrentUserReportDeleteRejected,
} from "../../../../../../lib/planning/server/reports/routeService";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
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
    if (hasCsrfCookie(request) && csrfToken) {
      assertCsrf(request, { csrf: csrfToken });
    }
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

export async function GET(request: Request, context: RouteContext) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      try {
        const { id } = await context.params;
        const data = await getCurrentUserReportDetailResponseData(id);
        if (!data) {
          return jsonError("NO_DATA", "리포트를 찾을 수 없습니다.", {
            meta: planningUserMeta(currentUser),
          });
        }
        return jsonOk({ data }, { meta: planningUserMeta(currentUser) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "리포트 조회에 실패했습니다.";
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "리포트 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
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

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const { id } = await context.params;
      try {
        const expectedConfirm = buildConfirmString("DELETE report", id);
        const confirmText = asString(body?.confirmText);
        if (!verifyConfirm(confirmText, expectedConfirm)) {
          const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
          recordCurrentUserReportDeleteRejected({
            reportId: id,
            message,
          });
          return jsonError("CONFIRM_MISMATCH", message, {
            status: 400,
            meta: { expectedConfirm, ...planningUserMeta(currentUser) },
          });
        }

        const result = await deleteCurrentUserReportToTrash(id);
        if (!result.deleted) {
          return jsonError("NO_DATA", "리포트를 찾을 수 없습니다.", {
            meta: planningUserMeta(currentUser),
          });
        }
        return jsonOk({ data: { id, deleted: true, softDeleted: true } }, {
          meta: planningUserMeta(currentUser),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "리포트 삭제에 실패했습니다.";
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "리포트 삭제에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
