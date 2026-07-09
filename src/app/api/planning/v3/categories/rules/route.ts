import {
  NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import {
  CategoryRulesStoreInputError,
  listCurrentUserCategoryRules,
  upsertCurrentUserCategoryRule,
  } from "@/lib/planning/v3/service/categoryRulesRepository";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

type RuleBody = {
  id?: unknown;
  categoryId?: unknown;
  match?: unknown;
  priority?: unknown;
  enabled?: unknown;
  note?: unknown;
  csrf?: unknown;
} | null;

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

function withWriteGuard(request: Request, csrf: unknown): Response | null {
  try {
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(csrf) }, { allowWhenCookieMissing: true });
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

    try {
      const items = await listCurrentUserCategoryRules();
      return NextResponse.json({ ok: true, items, meta: userMeta });
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "카테고리 룰 목록 조회에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}

export async function POST(request: Request) {
  let body: RuleBody = null;
  try {
    body = (await request.json()) as RuleBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body?.csrf);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "룰 입력값이 필요합니다." }, meta: userMeta },
        { status: 400 },
      );
    }

    try {
      const rule = await upsertCurrentUserCategoryRule({
        ...(body.id !== undefined ? { id: body.id } : {}),
        categoryId: body.categoryId,
        match: body.match,
        priority: body.priority,
        enabled: body.enabled,
        note: body.note,
      });
      return NextResponse.json({ ok: true, rule, meta: userMeta });
    } catch (error) {
      if (error instanceof CategoryRulesStoreInputError) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "INPUT", message: "룰 입력값이 올바르지 않습니다." },
            details: error.details,
            meta: userMeta,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "카테고리 룰 저장에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
