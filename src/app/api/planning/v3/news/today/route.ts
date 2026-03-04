import { NextResponse } from "next/server";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { buildDigestDay } from "../../../../../../../planning/v3/news/digest/buildDigest";
import { buildScenarios } from "../../../../../../../planning/v3/news/scenario";
import { selectTopFromStore } from "../../../../../../../planning/v3/news/selectTop";
import { readDailyStats, readState } from "../../../../../../../planning/v3/news/store";
import { type TopicDailyStat as ScenarioTrendStat } from "../../../../../../../planning/v3/news/trend/contracts";
import { toKstDayKey } from "../../../../../../../planning/v3/news/trend";

export const runtime = "nodejs";

function normalizeBurstGradeForScenario(value: string): ScenarioTrendStat["burstGrade"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return "High";
  if (normalized === "med" || normalized === "중") return "Med";
  if (normalized === "low" || normalized === "하") return "Low";
  return "Unknown";
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

  const now = new Date();
  const dateKst = toKstDayKey(now);
  const topResult = selectTopFromStore({ now, windowHours: 72, topN: 10, topM: 5 });
  const trends = readDailyStats(dateKst);
  const trendsForScenario: ScenarioTrendStat[] = trends.map((row) => ({
    dateKst: row.dateKst,
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    count: row.count,
    scoreSum: row.scoreSum,
    sourceDiversity: row.sourceDiversity,
    burstGrade: normalizeBurstGradeForScenario(row.burstGrade),
  }));
  const digest = buildDigestDay({
    date: dateKst,
    topResult,
    burstTopics: trends,
  });
  const scenarios = buildScenarios({
    digest,
    trends: trendsForScenario,
    generatedAt: now.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    data: {
      lastRefreshedAt: readState().lastRunAt ?? null,
      digest,
      scenarios,
    },
  });
}
