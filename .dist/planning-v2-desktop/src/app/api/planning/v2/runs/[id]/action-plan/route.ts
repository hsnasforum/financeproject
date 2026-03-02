import {
  assertLocalHost,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../../../lib/http/apiResponse";
import { ensureRunActionPlan } from "../../../../../../../lib/planning/server/store/runActionStore";
import { getRun } from "../../../../../../../lib/planning/server/store/runStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  try {
    const run = await getRun(id);
    if (!run) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { status: 404 });
    }
    const plan = await ensureRunActionPlan(run);
    return jsonOk({ data: plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "action-plan 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
