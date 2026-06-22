import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import {
  parseOpsMetricsSummaryRange,
  readOpsMetricsSummaryPage,
  toOpsMetricsStorageErrorMessage,
} from "@/lib/ops/metrics/metricsRouteService";
import { isPlanningRouteUser, planningUserMeta, requirePlanningRouteUser } from "@/lib/planning/api/routeAuth";

function guardReadRequest(request: Request): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
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

  const guard = guardReadRequest(request);
  if (guard) return guard;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const { searchParams } = new URL(request.url);
  const rangeHours = parseOpsMetricsSummaryRange(searchParams.get("range"));

  try {
    const page = await readOpsMetricsSummaryPage({ rangeHours });

    return NextResponse.json({
      ok: true,
      data: page.data,
      meta: {
        range: page.range,
        ...planningUserMeta(currentUser),
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: toOpsMetricsStorageErrorMessage(error, "metrics 요약을 불러오지 못했습니다."),
      status: 500,
    });
  }
}
