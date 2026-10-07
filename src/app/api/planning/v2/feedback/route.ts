import { toGuardErrorResponse } from "@/lib/dev/devGuards";
import { jsonError, jsonOk } from "@/lib/planning/api/response";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { assertPlanningWriteGuard } from "@/lib/planning/api/writeGuard";
import {
  createCurrentUserPlanningFeedbackForRoute,
  parseCurrentUserPlanningFeedbackCreateInput,
  type PlanningFeedbackCreateBody,
} from "@/lib/planning/server/feedback/routeService";

function withWriteGuard(request: Request, body: PlanningFeedbackCreateBody) {
  try {
    assertPlanningWriteGuard(request, body);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.", { status: 500 });
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function POST(request: Request) {
  let body: PlanningFeedbackCreateBody = null;
  try {
    body = (await request.json()) as PlanningFeedbackCreateBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const parsed = parseCurrentUserPlanningFeedbackCreateInput(body);
  if (!parsed.ok) {
    return jsonError("INPUT", parsed.message, { status: 400 });
  }

  return await withPlanningRouteUser(request, async (currentUser) => {
    try {
      const created = await createCurrentUserPlanningFeedbackForRoute(parsed.input);
      return jsonOk({
        data: created,
        message: `저장됨(${created.id})`,
      }, {
        status: 201,
        meta: planningUserMeta(currentUser),
      });
    } catch (error) {
      return jsonError(
        "STORAGE_CORRUPT",
        error instanceof Error ? error.message : "피드백 저장에 실패했습니다.",
        { status: 500, meta: planningUserMeta(currentUser) },
      );
    }
  });
}
