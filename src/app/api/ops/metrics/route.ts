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
import {
  parseOpsMetricsLogType,
  readOpsMetricsLogPage,
  toOpsMetricsSafeInt,
  toOpsMetricsStorageErrorMessage,
} from "../../../../lib/ops/metrics/metricsRouteService";

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

  const limit = toOpsMetricsSafeInt(searchParams.get("limit"), 200, 1, 1000);
  const type = parseOpsMetricsLogType(searchParams.get("type"));

  try {
    const page = await readOpsMetricsLogPage({ limit, ...(type ? { type } : {}) });

    return NextResponse.json({
      ok: true,
      data: page.rows,
      summary: page.summary,
      meta: page.meta,
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: toOpsMetricsStorageErrorMessage(error, "metrics 로그를 불러오지 못했습니다."),
      status: 500,
    });
  }
}
