import {
  NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import {
  createCurrentUserProfileDraftFromBatch,
  isGenerateDraftInputError,
  listCurrentUserProfileDrafts,
  } from "@/lib/planning/v3/service/profileDraftRepository";
import { ForbiddenDraftKeyError,
  assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { planningStorageErrorResponse } from "@/lib/planning/api/storageErrorResponse";

type CreateDraftBody = {
  batchId?: unknown;
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

export async function POST(request: Request) {
  let body: CreateDraftBody = null;
  try {
    body = (await request.json()) as CreateDraftBody;
  } catch {
    body = null;
  }

  const guarded = withGuard(request, body?.csrf);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const batchId = asString(body?.batchId);
    if (!batchId) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "상담 자료 번호가 필요합니다." }, meta: userMeta },
        { status: 400 },
      );
    }

    try {
      const created = await createCurrentUserProfileDraftFromBatch(batchId);
      const payload = {
        ok: true,
        meta: userMeta,
        data: {
          draftId: created.id,
          id: created.id,
          batchId: created.batchId,
          createdAt: created.createdAt,
          ...(created.stats ? { stats: created.stats } : {}),
        },
      };
      assertNoForbiddenDraftKeys(payload);
      return NextResponse.json(payload);
    } catch (error) {
      const storageError = planningStorageErrorResponse(error, userMeta);
      if (storageError) return storageError;
      if (isGenerateDraftInputError(error)) {
        if (error.code === "INPUT") {
          return NextResponse.json(
            { ok: false, error: { code: "INPUT", message: "상담 자료 번호 형식이 올바르지 않습니다." }, meta: userMeta },
            { status: 400 },
          );
        }
        if (error.code === "NOT_FOUND") {
          return NextResponse.json(
            { ok: false, error: { code: "NO_DATA", message: "해당 상담 자료를 찾을 수 없습니다." }, meta: userMeta },
            { status: 404 },
          );
        }
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "상담 정보 초안을 만들 거래 데이터가 부족합니다." }, meta: userMeta },
          { status: 400 },
        );
      }
      if (error instanceof ForbiddenDraftKeyError) {
        return NextResponse.json(
          { ok: false, error: { code: "INTERNAL", message: "상담 정보 초안 내용을 확인하지 못했습니다." }, meta: userMeta },
          { status: 500 },
        );
      }
      if (error instanceof Error && error.message === "Invalid record id") {
        return NextResponse.json(
          { ok: false, error: { code: "INPUT", message: "상담 자료 번호 형식이 올바르지 않습니다." }, meta: userMeta },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "상담 정보 초안을 만들지 못했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}

export async function GET(request: Request) {
  const csrf = asString(new URL(request.url).searchParams.get("csrf"));
  const guarded = withGuard(request, csrf);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    try {
      const rows = await listCurrentUserProfileDrafts();
      const payload = {
        ok: true,
        meta: userMeta,
        data: rows.map((row) => ({
          draftId: row.id,
          id: row.id,
          batchId: row.batchId,
          createdAt: row.createdAt,
          ...(row.stats ? { stats: row.stats } : {}),
        })),
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
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "상담 정보 초안 목록을 확인하지 못했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
