import { NextResponse } from "next/server";
import { z } from "zod";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";
import {
  readDailyStatsLastNDays,
  readTrendsCache,
} from "../../../../../../../planning/v3/news/store";
import { shiftKstDay } from "../../../../../../../planning/v3/news/trend";

export const runtime = "nodejs";

const TrendSeriesPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
  burstGrade: z.string().trim().min(1),
  hasBurstMarker: z.boolean(),
});

const TrendTopicSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  burstGrade: z.string().trim().min(1),
  sourceDiversity: z.number().finite().min(0).max(1),
  series: z.array(TrendSeriesPointSchema),
});

const TrendsApiSchema = z.object({
  ok: z.literal(true),
  windowDays: z.union([z.literal(7), z.literal(30)]),
  data: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    topics: z.array(TrendTopicSchema),
  }).nullable(),
  hint: z.string().optional(),
});

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

function burstMarker(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "high" || normalized === "med" || normalized === "상" || normalized === "중";
}

function dayRange(toDateKst: string, days: number): string[] {
  const safeDays = Math.max(1, Math.min(365, Math.round(days)));
  const out: string[] = [];
  const start = shiftKstDay(toDateKst, -(safeDays - 1));
  for (let index = 0; index < safeDays; index += 1) {
    out.push(shiftKstDay(start, index));
  }
  return out;
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
    const payload = parseWithV3Whitelist(TrendsApiSchema, {
      ok: true,
      windowDays,
      data: null,
      hint: "캐시가 없습니다. 수동 갱신을 실행해 주세요.",
    }, { scope: "response", context: "api.v3.news.trends" });
    return NextResponse.json(payload);
  }

  const dailyRows = readDailyStatsLastNDays({
    toDateKst: cached.date,
    days: windowDays,
  });
  const dayKeys = dayRange(cached.date, windowDays);
  const rowsByTopicAndDay = new Map<string, { count: number; burstGrade: string }>();
  for (const row of dailyRows) {
    rowsByTopicAndDay.set(`${row.topicId}::${row.dateKst}`, {
      count: row.count,
      burstGrade: row.burstGrade,
    });
  }

  const topics = cached.topics.map((topic) => ({
    topicId: topic.topicId,
    topicLabel: topic.topicLabel,
    count: topic.count,
    burstGrade: topic.burstGrade,
    sourceDiversity: topic.sourceDiversity,
    series: dayKeys.map((date) => {
      const point = rowsByTopicAndDay.get(`${topic.topicId}::${date}`);
      return {
        date,
        count: point?.count ?? 0,
        burstGrade: point?.burstGrade ?? "Unknown",
        hasBurstMarker: burstMarker(point?.burstGrade ?? ""),
      };
    }),
  }));

  const payload = parseWithV3Whitelist(TrendsApiSchema, {
    ok: true,
    windowDays,
    data: {
      date: cached.date,
      topics,
    },
  }, { scope: "response", context: "api.v3.news.trends" });
  return NextResponse.json(payload);
}
