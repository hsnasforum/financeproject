import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  deleteCurrentUserProfileDraft,
  getCurrentUserProfileDraft,
} from "@/lib/planning/v3/service/profileDraftRepository";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { planningStorageErrorResponse } from "@/lib/planning/api/storageErrorResponse";

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
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const { id } = await context.params;
  try {
    const found = await getCurrentUserProfileDraft(id);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "상담 정보 초안을 찾을 수 없습니다." }, meta: userMeta },
        { status: 404 },
      );
    }
    const payload = {
      ok: true,
      meta: userMeta,
      data: found,
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const storageError = planningStorageErrorResponse(error, userMeta);
    if (storageError) return storageError;
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "상담 정보 초안 내용을 확인하지 못했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "상담 정보 초안 번호 형식이 올바르지 않습니다." }, meta: userMeta },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "상담 정보 초안 상세를 불러오지 못했습니다." }, meta: userMeta },
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
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const { id } = await context.params;
  try {
    const found = await getCurrentUserProfileDraft(id);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "상담 정보 초안을 찾을 수 없습니다." }, meta: userMeta },
        { status: 404 },
      );
    }

    const deleted = await deleteCurrentUserProfileDraft(id);
    if (!deleted.deleted) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "상담 정보 초안을 찾을 수 없습니다." }, meta: userMeta },
        { status: 404 },
      );
    }
    const payload = {
      ok: true,
      meta: userMeta,
      data: {
        deleted: deleted.deleted,
      },
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const storageError = planningStorageErrorResponse(error, userMeta);
    if (storageError) return storageError;
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "상담 정보 초안 번호 형식이 올바르지 않습니다." }, meta: userMeta },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "상담 정보 초안을 삭제하지 못했습니다." }, meta: userMeta },
      { status: 500 },
    );
  }
}
