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
  getDataQualityReportPath,
  readLatestExternalDataQualityReport,
  runExternalDataQualityChecks,
} from "../../../../lib/ops/dataQuality";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: unknown): boolean {
  const normalized = asString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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

  const refresh = asBool(searchParams.get("refresh"));

  try {
    const report = refresh
      ? await runExternalDataQualityChecks({ persist: true })
      : (await readLatestExternalDataQualityReport()) ?? await runExternalDataQualityChecks({ persist: true });

    return NextResponse.json({
      ok: true,
      data: report,
      meta: {
        path: getDataQualityReportPath(),
        source: refresh ? "refresh" : "latest-or-refresh",
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "INTERNAL",
      message: error instanceof Error ? error.message : "data quality 검사에 실패했습니다.",
      status: 500,
    });
  }
}
