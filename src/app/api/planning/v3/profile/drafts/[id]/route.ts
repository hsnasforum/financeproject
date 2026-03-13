import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { deleteProfileDraft, getProfileDraft } from "@/lib/planning/v3/draft/store";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DeleteBody = {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withGuard(request: Request, csrfValue: unknown): Response | null {
  try {
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(csrfValue) }, { allowWhenCookieMissing: true });
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
  const csrf = asString(new URL(request.url).searchParams.get("csrf"));
  const guarded = withGuard(request, csrf);
  if (guarded) return guarded;

  const { id } = await context.params;
  try {
    const found = await getProfileDraft(id);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    const payload = {
      ok: true,
      data: found,
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "초안 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "draftId 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  let body: DeleteBody = null;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    body = null;
  }

  const guarded = withGuard(request, body?.csrf);
  if (guarded) return guarded;

  const { id } = await context.params;
  try {
    const found = await getProfileDraft(id);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const deleted = await deleteProfileDraft(id);
    if (!deleted.deleted) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    const payload = {
      ok: true,
      data: {
        deleted: deleted.deleted,
      },
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "draftId 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 삭제에 실패했습니다." } },
      { status: 500 },
    );
  }
}
