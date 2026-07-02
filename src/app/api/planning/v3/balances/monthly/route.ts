import {
  NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import {
  getMonthlyBalanceProjection,
  MonthlyBalanceProjectionError,
  } from "@/lib/planning/v3/service/monthlyBalancesProjection";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: string | null): boolean {
  const normalized = asString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
}

function withReadGuard(request: Request): Response | null {
  try {
    assertSameOrigin(request);
    const csrf = asString(new URL(request.url).searchParams.get("csrf"));
    requireCsrf(request, { csrf }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const url = new URL(request.url);
    const batchId = asString(url.searchParams.get("batchId"));
    if (!batchId) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "batchId를 입력해 주세요." }, meta: userMeta },
        { status: 400 },
      );
    }
    const includeTransfers = asBoolean(url.searchParams.get("includeTransfers"));

    try {
      const computed = await getMonthlyBalanceProjection({ batchId, includeTransfers });
      return NextResponse.json({
        ok: true,
        ...computed,
        meta: userMeta,
      });
    } catch (error) {
      if (error instanceof MonthlyBalanceProjectionError && error.code === "NO_DATA") {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "배치 거래를 찾을 수 없습니다." }, meta: userMeta },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "월별 잔액 조회에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
