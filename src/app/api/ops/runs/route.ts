import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../lib/ops/errorContract";
import { isPlanningRouteUser, planningUserMeta, requirePlanningRouteUser } from "../../../../lib/planning/api/routeAuth";
import { listOpsRuns, opsRunsRouteMeta } from "../../../../lib/planning/server/runs/opsRouteService";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  try {
    const result = await listOpsRuns({
      profileId: searchParams.get("profileId"),
      status: searchParams.get("status"),
      q: searchParams.get("q"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
    });

    return NextResponse.json({
      ok: true,
      data: result.items,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
        ...planningUserMeta(currentUser),
        ...opsRunsRouteMeta(),
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "INTERNAL",
      message: error instanceof Error ? error.message : "실행 기록 조회에 실패했습니다.",
      status: 500,
    });
  }
}
