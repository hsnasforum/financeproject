import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  CategoryRulesStoreInputError,
  deleteRule,
} from "@/lib/planning/v3/categories/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withDeleteGuard(request: Request): Response | null {
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

export async function DELETE(request: Request, context: RouteContext) {
  const guarded = withDeleteGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;
  try {
    const deleted = await deleteRule(id);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    if (error instanceof CategoryRulesStoreInputError) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "룰 삭제 입력이 올바르지 않습니다." }, details: error.details },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "카테고리 룰 삭제에 실패했습니다." } },
      { status: 500 },
    );
  }
}
