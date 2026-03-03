import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  createProfile,
  getDefaultProfileId,
  getProfile,
} from "@/lib/planning/server/store/profileStore";
import { getDraft } from "@/lib/planning/v3/store/draftStore";
import { applyDraftToProfile } from "@/lib/planning/v3/service/applyDraftToProfile";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CreateProfileBody = {
  baseProfileId?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withWriteGuard(request: Request, body: CreateProfileBody): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(body?.csrf) }, { allowWhenCookieMissing: true });
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

export async function POST(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: CreateProfileBody = null;
  try {
    body = (await request.json()) as CreateProfileBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const { id } = await context.params;

  try {
    const draft = await getDraft(id);
    if (!draft) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const requestedBaseProfileId = asString(body?.baseProfileId);
    const resolvedBaseProfileId = requestedBaseProfileId || asString(await getDefaultProfileId());
    if (!resolvedBaseProfileId) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "적용 대상 프로필이 필요합니다." } },
        { status: 400 },
      );
    }

    const baseRecord = await getProfile(resolvedBaseProfileId);
    if (!baseRecord) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "적용 대상 프로필을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const applied = applyDraftToProfile({
      baseProfile: baseRecord.profile,
      draft,
    });

    const created = await createProfile({
      name: `${baseRecord.name} (v3 draft)`,
      profile: applied.merged,
    });

    return NextResponse.json({
      ok: true,
      profileId: created.id,
    }, { status: 201 });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "새 프로필 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
