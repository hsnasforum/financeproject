import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { assertPlanningWriteGuard } from "../../../../../lib/planning/api/writeGuard";
import { jsonError, jsonOk } from "../../../../../lib/planning/api/response";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";
import {
  createCurrentUserReportResponseData,
  listCurrentUserReportResponseData,
} from "../../../../../lib/planning/server/reports/routeService";

type ReportsCreateBody = {
  runId?: unknown;
  recommendRunId?: unknown;
  csrf?: unknown;
} | null;

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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      try {
        const url = new URL(request.url);
        const limit = Math.max(1, Math.min(200, Math.trunc(Number(url.searchParams.get("limit"))) || 50));
        const data = await listCurrentUserReportResponseData(limit);
        return jsonOk({ data }, { meta: planningUserMeta(currentUser) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "리포트 목록 조회에 실패했습니다.";
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "리포트 목록 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: ReportsCreateBody = null;
  try {
    body = (await request.json()) as ReportsCreateBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      try {
        const runId = asString(body?.runId);
        const recommendRunId = asString(body?.recommendRunId);
        if (!runId) {
          return jsonError("INPUT", "runId는 필수입니다.", {
            status: 400,
            meta: planningUserMeta(currentUser),
          });
        }

        const created = await createCurrentUserReportResponseData({
          runId,
          ...(recommendRunId ? { recommendRunId } : {}),
        });
        return jsonOk({ data: created }, {
          status: 201,
          meta: planningUserMeta(currentUser),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "리포트 생성에 실패했습니다.";
        if (message.includes("not found")) {
          return jsonError("NO_DATA", "run 또는 profile을 찾을 수 없습니다.", {
            status: 404,
            meta: planningUserMeta(currentUser),
          });
        }
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "리포트 생성에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
