import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { getProfile } from "@/lib/planning/server/store/profileStore";
import { getDraft } from "@/lib/planning/v3/store/draftStore";
import { applyDraftToProfile } from "@/lib/planning/v3/service/applyDraftToProfile";

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

function isInvalidIdError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid record id";
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;
  const profileId = asString(new URL(request.url).searchParams.get("profileId"));
  if (!profileId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "profileId가 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    const [draft, baseRecord] = await Promise.all([
      getDraft(id),
      getProfile(profileId),
    ]);

    if (!draft || !baseRecord) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안 또는 프로필을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const result = applyDraftToProfile({
      baseProfile: baseRecord.profile,
      draft,
    });

    return NextResponse.json({
      ok: true,
      summary: result.summary,
      mergedProfile: result.merged,
    });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "적용 미리보기에 실패했습니다." } },
      { status: 500 },
    );
  }
}
