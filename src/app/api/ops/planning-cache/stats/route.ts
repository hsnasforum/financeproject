import {
  NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import {
  getOpsPlanningCacheStats,
  planningNamespaceMeta,
} from "@/lib/planning/server/cache/opsRouteService";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
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
  return await withPlanningRouteUser(request, async (currentUser) => {

    try {
      const data = await getOpsPlanningCacheStats();

      return NextResponse.json({
        ok: true,
        data,
        meta: {
          ...planningUserMeta(currentUser),
          ...planningNamespaceMeta(),
        },
      });
    } catch (error) {
      return opsErrorResponse({
        code: "STORAGE_CORRUPT",
        message: error instanceof Error ? error.message : "캐시 통계 조회에 실패했습니다.",
        status: 500,
      });
    }
  });
}
