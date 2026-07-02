import {
  assertCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
  } from "../../../../../lib/dev/devGuards";
import { jsonError,
  jsonOk } from "../../../../../lib/planning/api/response";
import {
  createCurrentUserShareReportResponseData,
  listCurrentUserShareReportResponseData,
  } from "../../../../../lib/planning/server/share/routeService";
import { type MaskLevel } from "../../../../../lib/planning/server/share/mask";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";

type ShareCreateBody = {
  runId?: unknown;
  level?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function parseMaskLevel(value: unknown): MaskLevel {
  return value === "light" || value === "standard" || value === "strict"
    ? value
    : "standard";
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

export async function GET(request: Request) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    try {
      const url = new URL(request.url);
      const limit = Math.max(1, Math.min(100, Math.trunc(Number(url.searchParams.get("limit"))) || 50));
      const data = await listCurrentUserShareReportResponseData(limit);
      return jsonOk(
        {
          data,
        },
        { meta: userMeta },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "공유 리포트 목록 조회에 실패했습니다.";
      return jsonError("INTERNAL", message, { status: 500, meta: userMeta });
    }
  });
}

export async function POST(request: Request) {
  let body: ShareCreateBody = null;
  try {
    body = (await request.json()) as ShareCreateBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    try {
      const runId = asString(body?.runId);
      if (!runId) {
        return jsonError("INPUT", "runId는 필수입니다.", { status: 400, meta: userMeta });
      }

      const created = await createCurrentUserShareReportResponseData({
        runId,
        level: parseMaskLevel(body?.level),
      });
      return jsonOk(
        {
          data: created,
        },
        { status: 201, meta: userMeta },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "공유 리포트 생성에 실패했습니다.";
      if (message.includes("not found")) {
        return jsonError("NO_DATA", "run 또는 profile을 찾을 수 없습니다.", {
          status: 404,
          meta: userMeta,
        });
      }
      return jsonError("INTERNAL", message, { status: 500, meta: userMeta });
    }
  });
}
