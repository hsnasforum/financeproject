import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  createDraftFromBatch,
  isGenerateDraftInputError,
  listProfileDrafts,
} from "@/lib/planning/v3/draft/store";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";

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

  const batchId = asString(body?.batchId);
  if (!batchId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "batchId가 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    const created = await createDraftFromBatch(batchId);
    const payload = {
      ok: true,
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
    if (isGenerateDraftInputError(error)) {
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
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 생성할 데이터가 부족합니다." } },
        { status: 400 },
      );
    }
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "초안 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "batchId 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 생성에 실패했습니다." } },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const csrf = asString(new URL(request.url).searchParams.get("csrf"));
  const guarded = withGuard(request, csrf);
  if (guarded) return guarded;

  try {
    const rows = await listProfileDrafts();
    const payload = {
      ok: true,
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
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "초안 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
