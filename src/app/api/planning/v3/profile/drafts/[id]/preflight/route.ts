import {
  NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import { getCurrentUserProfile, getCurrentUserProfileUpdateSnapshot } from "@/lib/planning/v3/service/profileRepository";
import { normalizeMonthlyPatch, monthlyPatchHash, ApplyDraftPatchToProfileError } from "@/lib/planning/v3/service/applyDraftPatchToProfile";
import { planningStorageErrorResponse } from "@/lib/planning/api/storageErrorResponse";
import { preflightDraftPatch } from "@/lib/planning/v3/draft/service";
import { getCurrentUserProfileDraft } from "@/lib/planning/v3/service/profileDraftRepository";
import { ForbiddenDraftKeyError,
  assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PreflightBody = {
  profileId?: unknown;
  applyMode?: unknown;
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

export async function POST(request: Request, context: RouteContext) {
  let body: PreflightBody = null;
  try {
    body = (await request.json()) as PreflightBody;
  } catch {
    body = null;
  }

  const guarded = withGuard(request, body?.csrf);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    try {
      const { id } = await context.params;
      const draft = await getCurrentUserProfileDraft(id);
      if (!draft) {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "상담 정보 초안을 찾을 수 없습니다." }, meta: userMeta },
          { status: 404 },
        );
      }

      const profileId = asString(body?.profileId);
      const mode = body?.applyMode ?? "create";
      if ((mode !== "create" && mode !== "update") || (mode === "update" && !profileId)) {
        return NextResponse.json({ ok: false, error: { code: "INPUT", message: "갱신할 프로필과 적용 방식을 확인해 주세요." }, meta: userMeta }, { status: 400 });
      }
      let baseProfile = undefined;
      let profileRevision: string | undefined;
      if (profileId) {
        const snapshot = mode === "update" ? await getCurrentUserProfileUpdateSnapshot(profileId) : null;
        const base = mode === "update" ? snapshot?.record : await getCurrentUserProfile(profileId);
        if (!base) {
          return NextResponse.json(
            { ok: false, error: { code: "NO_DATA", message: "기준 상담 정보를 찾을 수 없습니다." }, meta: userMeta },
            { status: 404 },
          );
        }
        baseProfile = base.profile;
        profileRevision = snapshot?.revision;
      }

      const patch = mode === "update" ? normalizeMonthlyPatch(draft.draftPatch) : draft.draftPatch;
      if (mode === "update" && Object.keys(patch).length < 1) {
        throw new ApplyDraftPatchToProfileError("INPUT", "초안에 반영할 월 현금흐름 값이 없습니다.");
      }
      const data = preflightDraftPatch({
        draftPatch: patch,
        evidence: draft.evidence,
        ...(baseProfile ? { baseProfile } : {}),
        ...(profileId ? { targetProfileId: profileId } : {}),
      });
      const payload = {
        ok: true,
        meta: userMeta,
        data: {
          ...data,
          ...(mode === "update" ? { profileRevision, draftPatchHash: monthlyPatchHash(patch) } : {}),
        },
      };
      assertNoForbiddenDraftKeys(payload);
      return NextResponse.json(payload);
    } catch (error) {
      const storageError = planningStorageErrorResponse(error, userMeta, { recoveryHref: null });
      if (storageError) return storageError;
      if (error instanceof ApplyDraftPatchToProfileError) {
        return NextResponse.json({ ok: false, error: { code: error.code, message: "초안의 월 현금흐름 값을 확인해 주세요." }, meta: userMeta }, { status: error.status });
      }
      if (error instanceof ForbiddenDraftKeyError) {
        return NextResponse.json(
          { ok: false, error: { code: "INTERNAL", message: "적용 전 점검 결과를 확인하지 못했습니다." }, meta: userMeta },
          { status: 500 },
        );
      }
      if (error instanceof Error && error.message === "Invalid record id") {
        return NextResponse.json(
          { ok: false, error: { code: "INPUT", message: "상담 정보 초안 번호 또는 기준 상담 정보 번호 형식이 올바르지 않습니다." }, meta: userMeta },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "적용 전 점검을 완료하지 못했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
