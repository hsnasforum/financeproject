import {
  NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import {
  ApplyDraftPatchToProfileError,
  applyDraftPatchToProfile,
  } from "@/lib/planning/v3/draft/service";
import { ForbiddenDraftKeyError,
  assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { planningStorageErrorResponse } from "@/lib/planning/api/storageErrorResponse";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ApplyBody = {
  profileId?: unknown;
  applyMode?: unknown;
  expectedProfileRevision?: unknown;
  expectedDraftPatchHash?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeApplyMessage(error: ApplyDraftPatchToProfileError): string {
  if (error.code === "CONFLICT") return "프로필이 변경되어 preflight를 다시 확인해야 합니다.";
  if (error.code === "NO_DATA") {
    return error.message.includes("기준 프로필") || error.message.includes("기준 상담 정보")
      ? "기준 상담 정보를 찾을 수 없습니다."
      : "상담 정보 초안을 찾을 수 없습니다.";
  }
  if (error.code === "INPUT") {
    if (error.message.includes("형식")) return "상담 정보 초안 번호 또는 기준 상담 정보 번호 형식이 올바르지 않습니다.";
    return "상담 정보 생성에 필요한 값을 확인해 주세요.";
  }
  return "상담 정보 생성 중 오류가 발생했습니다.";
}

function toSafeApplyDetails(details: ApplyDraftPatchToProfileError["details"]) {
  return details?.map((detail) => ({
    ...detail,
    message: "상담 정보 항목 값을 다시 확인해 주세요.",
  }));
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
  let body: ApplyBody = null;
  try {
    body = (await request.json()) as ApplyBody;
  } catch {
    body = null;
  }

  const guarded = withGuard(request, body?.csrf);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    try {
      const { id } = await context.params;
      const applyMode = body?.applyMode ?? "create";
      if (applyMode !== "create" && applyMode !== "update") {
        return NextResponse.json({ ok: false, error: { code: "INPUT", message: "적용 방식을 확인해 주세요." }, meta: userMeta }, { status: 400 });
      }
      const result = await applyDraftPatchToProfile({
        draftId: id,
        baseProfileId: asString(body?.profileId) || undefined,
        applyMode,
        expectedProfileRevision: asString(body?.expectedProfileRevision) || undefined,
        expectedDraftPatchHash: asString(body?.expectedDraftPatchHash) || undefined,
      });
      const payload = {
        ok: true,
        meta: userMeta,
        data: {
          profileId: result.updatedProfileId ?? result.createdProfileId,
        },
      };
      assertNoForbiddenDraftKeys(payload);
      return NextResponse.json(payload);
    } catch (error) {
      const storageError = planningStorageErrorResponse(error, userMeta, { recoveryHref: null });
      if (storageError) return storageError;
      if (error instanceof ApplyDraftPatchToProfileError) {
        const details = toSafeApplyDetails(error.details);
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: error.code,
              message: toSafeApplyMessage(error),
              ...(details ? { details } : {}),
            },
            meta: userMeta,
          },
          { status: error.status },
        );
      }
      if (error instanceof ForbiddenDraftKeyError) {
        return NextResponse.json(
          { ok: false, error: { code: "INTERNAL", message: "상담 정보 생성 결과를 확인하지 못했습니다." }, meta: userMeta },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "상담 정보 생성 처리에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
