import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { readTodayCache } from "@/lib/planning/v3/news/store";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";

export const runtime = "nodejs";

const TodayApiSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    lastRefreshedAt: z.string().datetime().nullable(),
    digest: z.unknown(),
    scenarios: z.unknown(),
  }).nullable(),
  hint: z.string().optional(),
});

function withReadGuard(request: Request): Response | null {
  try {
    assertSameOrigin(request);
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

  const cached = readTodayCache();
  if (!cached) {
    const payload = parseWithV3Whitelist(TodayApiSchema, {
      ok: true,
      data: null,
      hint: "캐시가 없습니다. 수동 갱신을 실행해 주세요.",
    }, { scope: "response", context: "api.v3.news.today" });
    return NextResponse.json(payload);
  }

  const payload = parseWithV3Whitelist(TodayApiSchema, {
    ok: true,
    data: {
      lastRefreshedAt: cached.lastRefreshedAt,
      digest: cached.digest,
      scenarios: cached.scenarios,
    },
  }, { scope: "response", context: "api.v3.news.today" });
  return NextResponse.json(payload);
}
