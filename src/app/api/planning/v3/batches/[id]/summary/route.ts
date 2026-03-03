import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";
import { GetBatchSummaryError, getBatchSummary } from "@/lib/planning/v3/service/getBatchSummary";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
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

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;
  try {
    const summary = await getBatchSummary(id);
    const payload = {
      ok: true,
      data: summary,
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof GetBatchSummaryError) {
      if (error.code === "INPUT") {
        return NextResponse.json(
          { ok: false, error: { code: "INPUT", message: "batchId 형식이 올바르지 않습니다." } },
          { status: 400 },
        );
      }
      if (error.code === "NOT_FOUND") {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
          { status: 404 },
        );
      }
    }
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "배치 요약 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 요약 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

