import {
  assertSameOrigin,
  toGuardErrorResponse,
  } from "../../../../../../lib/dev/devGuards";
import { jsonError,
  jsonOk } from "../../../../../../lib/planning/api/response";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../../lib/planning/api/routeAuth";
import { listRouteAssumptionsSnapshots } from "../../../../../../lib/planning/server/assumptions/snapshotsRouteService";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeLimit(value: string): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(100, parsed));
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
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const { searchParams } = new URL(request.url);
    const limit = toSafeLimit(asString(searchParams.get("limit")));

    try {
      return jsonOk(await listRouteAssumptionsSnapshots({ limit, now: new Date() }), { meta: userMeta });
    } catch (error) {
      return jsonError(
        "INTERNAL",
        error instanceof Error ? error.message : "스냅샷 목록 조회에 실패했습니다.",
        { status: 500 },
      );
    }
  });
}
