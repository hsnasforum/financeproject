import { NextResponse } from "next/server";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { groupAlertEventsByDay, readRecentAlertEvents } from "@/lib/news/alerts";

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const days = Math.max(1, Math.min(90, Math.round(asNumber(url.searchParams.get("days"), 14))));
  const events = readRecentAlertEvents({ days });
  const groups = groupAlertEventsByDay(events);

  return NextResponse.json({
    ok: true,
    data: {
      days,
      total: events.length,
      groups,
    },
  });
}
