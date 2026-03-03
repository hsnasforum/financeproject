import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { listBatches } from "@/lib/planning/v3/service/transactionStore";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);

  try {
    const listed = await listBatches({
      ...(asPositiveInt(url.searchParams.get("limit")) ? { limit: asPositiveInt(url.searchParams.get("limit")) } : {}),
      ...(asString(url.searchParams.get("cursor")) ? { cursor: asString(url.searchParams.get("cursor")) } : {}),
    });

    return NextResponse.json({
      ok: true,
      items: listed.items,
      ...(listed.nextCursor ? { nextCursor: listed.nextCursor } : {}),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
