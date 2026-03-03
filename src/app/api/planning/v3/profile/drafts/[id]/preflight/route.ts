import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { getProfile } from "@/lib/planning/server/store/profileStore";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";
import { preflightDraftPatch } from "@/lib/planning/v3/service/preflightDraftPatch";
import { getProfileDraft } from "@/lib/planning/v3/store/draftStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PreflightBody = {
  profileId?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withGuard(request: Request, csrfValue: unknown): Response | null {
  try {
    assertLocalHost(request);
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

export async function POST(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: PreflightBody = null;
  try {
    body = (await request.json()) as PreflightBody;
  } catch {
    body = null;
  }

  const guarded = withGuard(request, body?.csrf);
  if (guarded) return guarded;

  try {
    const { id } = await context.params;
    const draft = await getProfileDraft(id);
    if (!draft) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const profileId = asString(body?.profileId);
    let baseProfile = undefined;
    if (profileId) {
      const base = await getProfile(profileId);
      if (!base) {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "기준 프로필을 찾을 수 없습니다." } },
          { status: 404 },
        );
      }
      baseProfile = base.profile;
    }

    const data = preflightDraftPatch({
      draftPatch: draft.draftPatch,
      ...(baseProfile ? { baseProfile } : {}),
      ...(profileId ? { targetProfileId: profileId } : {}),
    });
    const payload = {
      ok: true,
      data,
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "프리플라이트 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "draftId 또는 profileId 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "프리플라이트 실행에 실패했습니다." } },
      { status: 500 },
    );
  }
}

