import { NextResponse } from "next/server";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { readTrendsCache } from "../../../../../../../planning/v3/news/store";

export const runtime = "nodejs";

function withReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
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

function asWindow(value: string | null): 7 | 30 {
  return value === "30" ? 30 : 7;
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const windowDays = asWindow(url.searchParams.get("window"));
  const cached = readTrendsCache(windowDays);
  if (!cached) {
    return NextResponse.json({
      ok: true,
      windowDays,
      data: null,
      hint: "캐시가 없습니다. 수동 갱신을 실행해 주세요.",
    });
  }

  return NextResponse.json({
    ok: true,
    windowDays,
    data: {
      date: cached.date,
      topics: cached.topics,
    },
  });
}
