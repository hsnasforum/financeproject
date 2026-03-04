import { NextResponse } from "next/server";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { readNewsTopicTrends } from "@/lib/news/trendReader";
import { trimTopicTrendsWindow } from "@/lib/news/trend";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asWindow(value: string | null): 7 | 30 {
  const normalized = asString(value);
  if (normalized === "30") return 30;
  return 7;
}

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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const windowDays = asWindow(url.searchParams.get("window"));
  const loaded = readNewsTopicTrends();
  const data = loaded ? trimTopicTrendsWindow(loaded, windowDays) : null;
  return NextResponse.json({
    ok: true,
    data,
    windowDays,
  });
}
