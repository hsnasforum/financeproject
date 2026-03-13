import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys, listProfileMetas } from "@/lib/planning/v3/profiles/store";

type ProfileRow = {
  profileId: string;
  name?: string;
  updatedAt?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIsoOrEmpty(value: unknown): string {
  const text = asString(value);
  if (!text) return "";
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toISOString();
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

function sortProfileRows(rows: ProfileRow[]): ProfileRow[] {
  return [...rows].sort((left, right) => {
    const leftTs = Date.parse(left.updatedAt ?? "");
    const rightTs = Date.parse(right.updatedAt ?? "");
    const leftValid = Number.isFinite(leftTs);
    const rightValid = Number.isFinite(rightTs);
    if (leftValid && rightValid && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    if (leftValid !== rightValid) {
      return rightValid ? 1 : -1;
    }
    return left.profileId.localeCompare(right.profileId);
  });
}

export async function GET(request: Request) {
  const csrf = asString(new URL(request.url).searchParams.get("csrf"));
  const guarded = withGuard(request, csrf);
  if (guarded) return guarded;

  try {
    const items = await listProfileMetas();
    const rows = sortProfileRows(items.map((item) => ({
      profileId: item.profileId,
      ...(asString(item.name) ? { name: asString(item.name) } : {}),
      ...(normalizeIsoOrEmpty(item.updatedAt) ? { updatedAt: normalizeIsoOrEmpty(item.updatedAt) } : {}),
    })));
    const payload = {
      ok: true,
      data: rows,
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "프로필 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "프로필 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
