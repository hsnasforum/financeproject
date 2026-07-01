import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../lib/planning/api/response";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";
import {
  handleCreatePlanningRunPost,
} from "../../../../../lib/planning/server/runs/createRunRouteAdapter";
import {
  listCurrentUserRunsForRoute,
} from "../../../../../lib/planning/server/runs/routeService";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

export async function GET(request: Request) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const url = new URL(request.url);
  const profileId = asString(url.searchParams.get("profileId"));
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");

  try {
    const runsResult = await listCurrentUserRunsForRoute({
      ...(profileId ? { profileId } : {}),
      ...(limit !== null ? { limit: Number(limit) } : {}),
      ...(offset !== null ? { offset: Number(offset) } : {}),
    });
    return jsonOk(
      { data: runsResult.runs, meta: { actionProgressSummaryByRunId: runsResult.actionProgressSummaryByRunId } },
      { meta: userMeta },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500, meta: userMeta });
  }
}

export async function POST(request: Request) {
  return handleCreatePlanningRunPost(request);
}
