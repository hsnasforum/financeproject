import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { jsonError } from "../../../../../../../lib/planning/api/response";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "../../../../../../../lib/planning/api/routeAuth";
import { getCurrentUserRunResultExport } from "../../../../../../../lib/planning/server/reports/runExportRouteService";

type RouteContext = {
  params: Promise<{ id: string }>;
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

export async function GET(request: Request, context: RouteContext) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const { id } = await context.params;
  try {
    const exportPayload = await getCurrentUserRunResultExport(id);
    if (!exportPayload) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { meta: userMeta });
    }

    return new Response(`${JSON.stringify(exportPayload.resultDto, null, 2)}\n`, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportPayload.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 export에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500, meta: userMeta });
  }
}
