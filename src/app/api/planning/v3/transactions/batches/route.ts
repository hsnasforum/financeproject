import {
  NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import { listTransactionBatchRows } from "@/lib/planning/v3/service/transactionBatchListRows";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

    try {
      const rows = await listTransactionBatchRows({
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
      });

      return NextResponse.json({
        ok: true,
        items: rows.items,
        data: rows.data,
        meta: userMeta,
        ...(rows.nextCursor ? { nextCursor: rows.nextCursor } : {}),
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "배치 목록 조회에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
