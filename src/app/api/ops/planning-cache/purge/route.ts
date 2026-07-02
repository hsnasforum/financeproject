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
  auditOpsPlanningCachePurgeError,
  planningNamespaceMeta,
  purgeOpsPlanningCache,
} from "@/lib/planning/server/cache/opsRouteService";

type PurgeBody = {
  csrf?: unknown;
} | null;

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: PurgeBody = null;
  try {
    body = (await request.json()) as PurgeBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body);
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
      const { result, message } = await purgeOpsPlanningCache({ user: currentUser });

      return NextResponse.json({
        ok: true,
        data: result,
        meta: {
          ...planningUserMeta(currentUser),
          ...planningNamespaceMeta(),
        },
        message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "캐시 정리에 실패했습니다.";
      auditOpsPlanningCachePurgeError({
        message,
        user: currentUser,
      });

      return opsErrorResponse({
        code: "STORAGE_CORRUPT",
        message,
        status: 500,
      });
    }
  });
}
