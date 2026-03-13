import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireCsrf, toGuardErrorResponse } from "@/lib/dev/devGuards";
import {
  readAlertEventState,
  readRecentAlertEvents,
  updateAlertEventState,
} from "@/lib/planning/v3/news/alerts";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function withWriteGuard(request: Request, body: unknown): Response | null {
  try {
    assertSameOrigin(request);
    requireCsrf(request, body as { csrf?: unknown } | null, { allowWhenCookieMissing: true });
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

const AlertEventResponseSchema = z.object({
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  dayKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(["news:refresh", "indicators:refresh"]),
  ruleId: z.string().trim().min(1),
  ruleKind: z.enum(["topic_burst", "indicator"]),
  level: z.enum(["high", "medium", "low"]),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  targetType: z.enum(["topic", "item", "scenario", "series"]),
  targetId: z.string().trim().min(1),
  link: z.string().trim().min(1).optional(),
  state: z.object({
    acknowledgedAt: z.string().datetime().nullable(),
    hiddenAt: z.string().datetime().nullable(),
  }),
});

const AlertGroupResponseSchema = z.object({
  dayKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  events: z.array(AlertEventResponseSchema),
});

const AlertsMutationSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(["ack", "unack", "hide", "unhide"]),
});

const AlertsDataSchema = z.object({
  days: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  summary: z.object({
    highTotal: z.number().int().nonnegative(),
    visibleTotal: z.number().int().nonnegative(),
    pendingTotal: z.number().int().nonnegative(),
    acknowledgedTotal: z.number().int().nonnegative(),
    hiddenTotal: z.number().int().nonnegative(),
    latestVisibleTitle: z.string().trim().min(1).nullable(),
    latestVisibleCreatedAt: z.string().datetime().nullable(),
  }),
  groups: z.array(AlertGroupResponseSchema),
  mutation: AlertsMutationSchema.optional(),
});

const AlertsResponseSchema = z.object({
  ok: z.literal(true),
  data: AlertsDataSchema,
});

const AlertsPostBodySchema = z.object({
  csrf: z.string().optional(),
  id: z.string().trim().min(1),
  action: z.enum(["ack", "unack", "hide", "unhide"]),
  days: z.number().int().positive().max(90).optional(),
});

function buildAlertsData(days: number) {
  const events = readRecentAlertEvents({ days });
  const stateById = new Map(readAlertEventState().items.map((row) => [row.id, row]));
  const mergedEvents = events.map((event) => {
    const state = stateById.get(event.id);
    return {
      ...event,
      state: {
        acknowledgedAt: state?.acknowledgedAt ?? null,
        hiddenAt: state?.hiddenAt ?? null,
      },
    };
  });
  const byDay = new Map<string, typeof mergedEvents>();
  for (const event of mergedEvents) {
    const bucket = byDay.get(event.dayKst) ?? [];
    bucket.push(event);
    byDay.set(event.dayKst, bucket);
  }
  const visibleEvents = mergedEvents.filter((event) => !event.state.hiddenAt);
  const pendingEvents = visibleEvents.filter((event) => !event.state.acknowledgedAt);
  const acknowledgedEvents = visibleEvents.filter((event) => !!event.state.acknowledgedAt);
  const hiddenEvents = mergedEvents.filter((event) => !!event.state.hiddenAt);
  const latestVisible = visibleEvents[0] ?? null;
  return {
    days,
    total: mergedEvents.length,
    summary: {
      highTotal: mergedEvents.filter((event) => event.level === "high").length,
      visibleTotal: visibleEvents.length,
      pendingTotal: pendingEvents.length,
      acknowledgedTotal: acknowledgedEvents.length,
      hiddenTotal: hiddenEvents.length,
      latestVisibleTitle: latestVisible?.title ?? null,
      latestVisibleCreatedAt: latestVisible?.createdAt ?? null,
    },
    groups: [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dayKst, bucket]) => ({
        dayKst,
        events: bucket.sort((left, right) => {
          const l = Date.parse(left.createdAt);
          const r = Date.parse(right.createdAt);
          if (l !== r) return r - l;
          return right.id.localeCompare(left.id);
        }),
      })),
  };
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Math.round(asNumber(url.searchParams.get("days"), 14))));
  const data = buildAlertsData(days);

  const payload = parseWithV3Whitelist(AlertsResponseSchema, {
    ok: true,
    data,
  }, { scope: "response", context: "api.v3.news.alerts" });
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const parsed = AlertsPostBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "알림 상태 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  updateAlertEventState({
    id: parsed.data.id,
    action: parsed.data.action,
  });
  const days = Math.max(1, Math.min(90, Math.round(asNumber(parsed.data.days, 30))));
  const data = {
    ...buildAlertsData(days),
    mutation: {
      id: parsed.data.id,
      action: parsed.data.action,
    },
  };

  const payload = parseWithV3Whitelist(AlertsResponseSchema, {
    ok: true,
    data,
  }, { scope: "response", context: "api.v3.news.alerts.post" });
  return NextResponse.json(payload);
}
