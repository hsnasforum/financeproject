import { NextResponse } from "next/server";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { readDailyStats, readDailyStatsLastNDays } from "../../../../../../../planning/v3/news/store";
import { toKstDayKey } from "../../../../../../../planning/v3/news/trend";

type TrendRow = {
  topicId: string;
  topicLabel: string;
  count: number;
  burstGrade: string;
  sourceDiversity: number;
};

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

function burstWeight(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return 4;
  if (normalized === "med" || normalized === "중") return 3;
  if (normalized === "low" || normalized === "하") return 2;
  return 1;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function aggregateRows(input: {
  todayRows: ReturnType<typeof readDailyStats>;
  windowRows: ReturnType<typeof readDailyStatsLastNDays>;
}): TrendRow[] {
  const map = new Map<string, {
    topicId: string;
    topicLabel: string;
    count: number;
    diversitySum: number;
    diversityDays: number;
    burstGrade: string;
  }>();

  const todayByTopic = new Map(input.todayRows.map((row) => [row.topicId, row] as const));

  for (const row of input.windowRows) {
    const prev = map.get(row.topicId) ?? {
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: 0,
      diversitySum: 0,
      diversityDays: 0,
      burstGrade: "Unknown",
    };
    prev.count += row.count;
    prev.diversitySum += row.sourceDiversity;
    prev.diversityDays += 1;
    map.set(row.topicId, prev);
  }

  const out: TrendRow[] = [...map.values()].map((row) => {
    const today = todayByTopic.get(row.topicId);
    return {
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: row.count,
      burstGrade: today?.burstGrade ?? row.burstGrade,
      sourceDiversity: row.diversityDays > 0 ? round3(row.diversitySum / row.diversityDays) : 0,
    };
  });

  return out.sort((a, b) => {
    const gradeDiff = burstWeight(b.burstGrade) - burstWeight(a.burstGrade);
    if (gradeDiff !== 0) return gradeDiff;
    if (a.count !== b.count) return b.count - a.count;
    if (a.sourceDiversity !== b.sourceDiversity) return b.sourceDiversity - a.sourceDiversity;
    return a.topicId.localeCompare(b.topicId);
  });
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const windowDays = asWindow(url.searchParams.get("window"));
  const todayKst = toKstDayKey(new Date());
  const todayRows = readDailyStats(todayKst);
  const windowRows = readDailyStatsLastNDays({ toDateKst: todayKst, days: windowDays });
  const topics = aggregateRows({ todayRows, windowRows });

  return NextResponse.json({
    ok: true,
    windowDays,
    data: topics.length > 0
      ? {
        date: todayKst,
        topics,
      }
      : null,
  });
}
