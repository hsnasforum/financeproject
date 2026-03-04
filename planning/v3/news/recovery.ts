import path from "node:path";
import { z } from "zod";
import { type TopicDailyStat } from "./contracts";
import { buildDigest } from "./digest";
import { buildDigestDay } from "./digest/buildDigest";
import { loadEffectiveNewsConfig } from "./settings";
import { buildScenarios } from "./scenario";
import { selectTopFromStore } from "./selectTop";
import {
  readAllItems,
  readDailyStats,
  readDailyStatsLastNDays,
  readState,
  resolveDailyStatsPath,
  resolveDigestPath,
  resolveScenariosCachePath,
  resolveTodayCachePath,
  resolveTrendsCachePath,
  type TrendCacheTopic,
  writeDailyStats,
  writeDigest,
  writeScenariosCache,
  writeTodayCache,
  writeTrendsCache,
} from "./store";
import { buildRollingDailyStats, shiftKstDay, toKstDayKey } from "./trend";

export const NEWS_RECOVERY_ACTIONS = ["rebuild_caches", "recompute_trends"] as const;
export const NEWS_RECOVERY_RECOMPUTE_DAYS = 45 as const;

export const RecoveryActionSchema = z.enum(NEWS_RECOVERY_ACTIONS);
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;

export const RecoverySummarySchema = z.object({
  action: RecoveryActionSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  itemCount: z.number().int().nonnegative(),
  dailyDays: z.number().int().nonnegative(),
  writeTargets: z.array(z.string().trim().min(1)).min(1),
  notes: z.array(z.string().trim().min(1)).default([]),
});
export type RecoverySummary = z.infer<typeof RecoverySummarySchema>;

export const RecoveryExecutionSchema = z.object({
  action: RecoveryActionSchema,
  executedAt: z.string().datetime(),
  itemCount: z.number().int().nonnegative(),
  dailyDays: z.number().int().nonnegative(),
  writeTargets: z.array(z.string().trim().min(1)).min(1),
  wroteCount: z.number().int().positive(),
});
export type RecoveryExecution = z.infer<typeof RecoveryExecutionSchema>;

type RecoveryOptions = {
  rootDir?: string;
  now?: Date;
};

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

function aggregateTrendRows(input: {
  todayRows: TopicDailyStat[];
  windowRows: TopicDailyStat[];
}): TrendCacheTopic[] {
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

  const out: TrendCacheTopic[] = [...map.values()].map((row) => {
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

function normalizeBurstGradeForScenario(value: string): "High" | "Med" | "Low" | "Unknown" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return "High";
  if (normalized === "med" || normalized === "중") return "Med";
  if (normalized === "low" || normalized === "하") return "Low";
  return "Unknown";
}

function toWritePath(absPath: string, rootDir: string): string {
  const relative = path.relative(rootDir, absPath);
  return `.data/news/${relative.replaceAll(path.sep, "/")}`;
}

function kstNoonUtc(dayKst: string): Date {
  const [year, month, day] = dayKst.split("-").map((token) => Number(token));
  const utc = Date.UTC(year, month - 1, day, 3, 0, 0);
  return new Date(utc);
}

function recomputeDayRange(toDateKst: string, days: number): string[] {
  const safeDays = Math.max(1, Math.min(365, Math.round(days)));
  const start = shiftKstDay(toDateKst, -(safeDays - 1));
  const out: string[] = [];
  for (let offset = 0; offset < safeDays; offset += 1) {
    out.push(shiftKstDay(start, offset));
  }
  return out;
}

export function previewRecoveryAction(action: RecoveryAction, options: RecoveryOptions = {}): RecoverySummary {
  const rootDir = options.rootDir;
  const now = options.now ?? new Date();
  const todayKst = toKstDayKey(now);
  const itemCount = readAllItems(rootDir).length;

  if (action === "rebuild_caches") {
    const writeTargets = [
      toWritePath(resolveDailyStatsPath(todayKst, rootDir), rootDir ?? path.join(process.cwd(), ".data", "news")),
      toWritePath(resolveDigestPath(rootDir), rootDir ?? path.join(process.cwd(), ".data", "news")),
      toWritePath(resolveTodayCachePath(rootDir), rootDir ?? path.join(process.cwd(), ".data", "news")),
      toWritePath(resolveScenariosCachePath(rootDir), rootDir ?? path.join(process.cwd(), ".data", "news")),
      toWritePath(resolveTrendsCachePath(7, rootDir), rootDir ?? path.join(process.cwd(), ".data", "news")),
      toWritePath(resolveTrendsCachePath(30, rootDir), rootDir ?? path.join(process.cwd(), ".data", "news")),
    ];
    return RecoverySummarySchema.parse({
      action,
      title: "캐시 재구성",
      description: "기존 뉴스 아이템을 다시 읽어 digest/scenarios/trends 캐시를 재생성합니다.",
      itemCount,
      dailyDays: 1,
      writeTargets,
      notes: [
        "기본 뉴스 아이템(.data/news/items)은 변경하지 않습니다.",
        "기존 캐시/요약 파일을 덮어써 최신 구조로 정렬합니다.",
      ],
    });
  }

  const days = NEWS_RECOVERY_RECOMPUTE_DAYS;
  const dayRange = recomputeDayRange(todayKst, days);
  const baseRoot = rootDir ?? path.join(process.cwd(), ".data", "news");
  const writeTargets = [
    toWritePath(resolveDailyStatsPath(dayRange[0], rootDir), baseRoot),
    toWritePath(resolveDailyStatsPath(dayRange[dayRange.length - 1], rootDir), baseRoot),
    toWritePath(resolveTrendsCachePath(7, rootDir), baseRoot),
    toWritePath(resolveTrendsCachePath(30, rootDir), baseRoot),
  ];
  return RecoverySummarySchema.parse({
    action,
    title: "트렌드 재계산",
    description: `최근 ${days}일 일별 토픽 통계를 재계산하고 7/30일 트렌드 캐시를 다시 생성합니다.`,
    itemCount,
    dailyDays: days,
    writeTargets,
    notes: [
      "기본 뉴스 아이템(.data/news/items)은 변경하지 않습니다.",
      "일별 통계(.data/news/daily)와 트렌드 캐시만 재작성합니다.",
    ],
  });
}

export function runRecoveryAction(action: RecoveryAction, options: RecoveryOptions = {}): RecoveryExecution {
  const rootDir = options.rootDir;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const todayKst = toKstDayKey(now);
  const baseRoot = rootDir ?? path.join(process.cwd(), ".data", "news");
  const items = readAllItems(rootDir);
  const itemCount = items.length;
  const effective = loadEffectiveNewsConfig(rootDir);
  const sourceWeights = Object.fromEntries(effective.sources.map((row) => [row.id, row.weight]));

  if (action === "rebuild_caches") {
    const historyStatsByDay: Record<string, TopicDailyStat[]> = {};
    for (let offset = 1; offset <= 7; offset += 1) {
      const day = shiftKstDay(todayKst, -offset);
      historyStatsByDay[day] = readDailyStats(day, rootDir);
    }
    const todayStats = buildRollingDailyStats({
      items,
      dateKst: todayKst,
      historyStatsByDay,
      baselineDays: 7,
      now,
      sourceWeights,
      topics: effective.topics,
    });
    writeDailyStats(todayKst, todayStats, rootDir);

    const digest = buildDigest(
      { fromKst: shiftKstDay(todayKst, -2), toKst: todayKst },
      { rootDir, now, topN: 10, topM: 5 },
    );
    writeDigest(digest, rootDir);

    const topResult = selectTopFromStore({
      rootDir,
      now,
      windowHours: 72,
      topN: 10,
      topM: 5,
      sourceWeights,
      topics: effective.topics,
    });
    const digestDay = buildDigestDay({
      date: todayKst,
      topResult,
      burstTopics: todayStats,
    });
    const scenarios = buildScenarios({
      digest: digestDay,
      trends: todayStats.map((row) => ({
        dateKst: row.dateKst,
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        count: row.count,
        scoreSum: row.scoreSum,
        sourceDiversity: row.sourceDiversity,
        burstGrade: normalizeBurstGradeForScenario(row.burstGrade),
      })),
      generatedAt: nowIso,
    });
    const state = readState(rootDir);
    const lastRefreshedAt = state.lastRunAt ?? null;
    writeTodayCache({
      generatedAt: nowIso,
      date: todayKst,
      lastRefreshedAt,
      digest: digestDay,
      scenarios,
    }, rootDir);
    writeScenariosCache({
      generatedAt: nowIso,
      lastRefreshedAt,
      scenarios,
    }, rootDir);

    const trends7Rows = readDailyStatsLastNDays({ toDateKst: todayKst, days: 7, rootDir });
    const trends30Rows = readDailyStatsLastNDays({ toDateKst: todayKst, days: 30, rootDir });
    writeTrendsCache({
      generatedAt: nowIso,
      date: todayKst,
      windowDays: 7,
      topics: aggregateTrendRows({ todayRows: todayStats, windowRows: trends7Rows }),
    }, rootDir);
    writeTrendsCache({
      generatedAt: nowIso,
      date: todayKst,
      windowDays: 30,
      topics: aggregateTrendRows({ todayRows: todayStats, windowRows: trends30Rows }),
    }, rootDir);

    const writeTargets = [
      toWritePath(resolveDailyStatsPath(todayKst, rootDir), baseRoot),
      toWritePath(resolveDigestPath(rootDir), baseRoot),
      toWritePath(resolveTodayCachePath(rootDir), baseRoot),
      toWritePath(resolveScenariosCachePath(rootDir), baseRoot),
      toWritePath(resolveTrendsCachePath(7, rootDir), baseRoot),
      toWritePath(resolveTrendsCachePath(30, rootDir), baseRoot),
    ];
    return RecoveryExecutionSchema.parse({
      action,
      executedAt: nowIso,
      itemCount,
      dailyDays: 1,
      writeTargets,
      wroteCount: writeTargets.length,
    });
  }

  const recomputeDays = recomputeDayRange(todayKst, NEWS_RECOVERY_RECOMPUTE_DAYS);
  const computedByDay = new Map<string, TopicDailyStat[]>();
  for (const dayKst of recomputeDays) {
    const historyStatsByDay: Record<string, TopicDailyStat[]> = {};
    for (let offset = 1; offset <= 7; offset += 1) {
      const prevDay = shiftKstDay(dayKst, -offset);
      historyStatsByDay[prevDay] = computedByDay.get(prevDay) ?? readDailyStats(prevDay, rootDir);
    }
    const stats = buildRollingDailyStats({
      items,
      dateKst: dayKst,
      historyStatsByDay,
      baselineDays: 7,
      now: kstNoonUtc(dayKst),
      sourceWeights,
      topics: effective.topics,
    });
    writeDailyStats(dayKst, stats, rootDir);
    computedByDay.set(dayKst, stats);
  }

  const todayStats = computedByDay.get(todayKst) ?? readDailyStats(todayKst, rootDir);
  const trends7Rows = readDailyStatsLastNDays({ toDateKst: todayKst, days: 7, rootDir });
  const trends30Rows = readDailyStatsLastNDays({ toDateKst: todayKst, days: 30, rootDir });
  writeTrendsCache({
    generatedAt: nowIso,
    date: todayKst,
    windowDays: 7,
    topics: aggregateTrendRows({ todayRows: todayStats, windowRows: trends7Rows }),
  }, rootDir);
  writeTrendsCache({
    generatedAt: nowIso,
    date: todayKst,
    windowDays: 30,
    topics: aggregateTrendRows({ todayRows: todayStats, windowRows: trends30Rows }),
  }, rootDir);

  const writeTargets = [
    toWritePath(resolveDailyStatsPath(recomputeDays[0], rootDir), baseRoot),
    toWritePath(resolveDailyStatsPath(recomputeDays[recomputeDays.length - 1], rootDir), baseRoot),
    toWritePath(resolveTrendsCachePath(7, rootDir), baseRoot),
    toWritePath(resolveTrendsCachePath(30, rootDir), baseRoot),
  ];

  return RecoveryExecutionSchema.parse({
    action,
    executedAt: nowIso,
    itemCount,
    dailyDays: recomputeDays.length,
    writeTargets,
    wroteCount: recomputeDays.length + 2,
  });
}
