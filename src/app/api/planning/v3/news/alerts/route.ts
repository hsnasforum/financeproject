import { NextResponse } from "next/server";
import { z } from "zod";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { groupAlertEventsByDay, readRecentAlertEvents } from "@/lib/news/alerts";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";

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

const AlertsResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    days: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    groups: z.array(z.object({
      dayKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      events: z.array(z.unknown()),
    })),
  }),
});

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Math.round(asNumber(url.searchParams.get("days"), 14))));
  const events = readRecentAlertEvents({ days });
  const groups = groupAlertEventsByDay(events);

  const payload = parseWithV3Whitelist(AlertsResponseSchema, {
    ok: true,
    data: {
      days,
      total: events.length,
      groups,
    },
  }, { scope: "response", context: "api.v3.news.alerts" });
  return NextResponse.json(payload);
}
