import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import {
  parseOpsMetricsStoreType,
  readOpsMetricsEventsPage,
  toOpsMetricsSafeInt,
  toOpsMetricsStorageErrorMessage,
} from "@/lib/ops/metrics/metricsRouteService";

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

  const { searchParams } = new URL(request.url);
  const limit = toOpsMetricsSafeInt(searchParams.get("limit"), 200, 1, 1000);
  const type = parseOpsMetricsStoreType(searchParams.get("type"));

  try {
    const page = await readOpsMetricsEventsPage({ limit, ...(type ? { type } : {}) });

    return NextResponse.json({
      ok: true,
      data: page.rows,
      meta: page.meta,
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: toOpsMetricsStorageErrorMessage(error, "metrics 이벤트를 불러오지 못했습니다."),
      status: 500,
    });
  }
}
