import { describe, expect, it } from "vitest";
import { evaluateAlerts } from "../alerts/evaluateAlerts";
import { type ExposureProfile } from "../exposure/contracts";
import { computeImpact } from "../financeNews/impactModel";
import { buildDigestFromInputs } from "../news/digest";
import { buildDigestDay } from "../news/digest/buildDigest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "../news/fixtures/sample-items";
import { assertNoRecommendationText } from "../news/guard/noRecommendationText";
import { buildScenarios } from "../news/scenario";
import { selectTopFromItems } from "../news/select/selectTop";
import { computeDailyStats } from "../news/trend/computeDailyStats";
import { type Observation } from "../indicators/contracts";
import { type TopicDailyStat as DigestTopicDailyStat } from "../news/contracts";
import { type TopicDailyStat as TrendTopicDailyStat } from "../news/trend/contracts";

type GoldenOutput = {
  digest: {
    dateRange: { fromKst: string; toKst: string };
    observationLines: string[];
    watchlist: Array<{ label: string; seriesId: string; status: string; grade: string; compactSummary: string }>;
    evidence: Array<{ title: string; url: string; topicId: string; score: number; publishedAt?: string }>;
    burstTopics: Array<{ topicId: string; count: number; burstGrade: string; scoreSum: number; sourceDiversity: number }>;
  };
  scenarios: Array<{
    name: "Base" | "Bull" | "Bear";
    linkedTopics: string[];
    observation: string;
    triggers: Array<{ kind: string; topicId: string; condition: string; note?: string }>;
    invalidation: string[];
    options: string[];
  }>;
  alerts: Array<{
    ruleId: string;
    ruleKind: string;
    level: string;
    targetType: string;
    targetId: string;
    title: string;
    summary: string;
    snapshotStatus: string;
  }>;
  impact: Array<{
    name: "Base" | "Bull" | "Bear";
    grades: {
      cashflowRisk: string;
      debtServiceRisk: string;
      inflationPressureRisk: string;
      fxPressureRisk: string;
      incomeRisk: string;
      bufferAdequacy: string;
    };
    rationale: string[];
    watch: string[];
  }>;
};

const NOW = new Date(FIXTURE_NOW_ISO);
const DATE_KST = "2026-03-04";
const FROM_KST = "2026-03-02";

const SERIES: Record<string, Observation[]> = {
  kr_base_rate: [
    { date: "2025-01", value: 3.0 },
    { date: "2025-02", value: 3.0 },
    { date: "2025-03", value: 3.0 },
    { date: "2025-04", value: 3.1 },
    { date: "2025-05", value: 3.1 },
    { date: "2025-06", value: 3.1 },
    { date: "2025-07", value: 3.2 },
    { date: "2025-08", value: 3.2 },
    { date: "2025-09", value: 3.3 },
    { date: "2025-10", value: 3.3 },
    { date: "2025-11", value: 3.4 },
    { date: "2025-12", value: 3.4 },
    { date: "2026-01", value: 3.5 },
    { date: "2026-02", value: 3.5 },
    { date: "2026-03", value: 3.6 },
  ],
  kr_gov_bond_3y: [
    { date: "2025-01", value: 2.6 },
    { date: "2025-02", value: 2.55 },
    { date: "2025-03", value: 2.58 },
    { date: "2025-04", value: 2.62 },
    { date: "2025-05", value: 2.64 },
    { date: "2025-06", value: 2.66 },
    { date: "2025-07", value: 2.69 },
    { date: "2025-08", value: 2.7 },
    { date: "2025-09", value: 2.74 },
    { date: "2025-10", value: 2.77 },
    { date: "2025-11", value: 2.79 },
    { date: "2025-12", value: 2.8 },
    { date: "2026-01", value: 2.82 },
    { date: "2026-02", value: 2.84 },
    { date: "2026-03", value: 2.88 },
  ],
  kr_usdkrw: [
    { date: "2025-12-20", value: 1300 },
    { date: "2025-12-21", value: 1302 },
    { date: "2025-12-22", value: 1301 },
    { date: "2025-12-23", value: 1303 },
    { date: "2025-12-24", value: 1302 },
    { date: "2025-12-25", value: 1304 },
    { date: "2025-12-26", value: 1306 },
    { date: "2025-12-27", value: 1308 },
    { date: "2025-12-28", value: 1307 },
    { date: "2025-12-29", value: 1308 },
    { date: "2025-12-30", value: 1309 },
    { date: "2025-12-31", value: 1310 },
    { date: "2026-01-01", value: 1312 },
    { date: "2026-01-02", value: 1314 },
    { date: "2026-01-03", value: 1365 },
  ],
  kr_cab: [
    { date: "2025-01", value: 55.1 },
    { date: "2025-02", value: 55.3 },
    { date: "2025-03", value: 55.4 },
    { date: "2025-04", value: 55.5 },
    { date: "2025-05", value: 55.7 },
    { date: "2025-06", value: 55.8 },
    { date: "2025-07", value: 56.0 },
    { date: "2025-08", value: 56.1 },
    { date: "2025-09", value: 56.3 },
    { date: "2025-10", value: 56.4 },
    { date: "2025-11", value: 56.5 },
    { date: "2025-12", value: 56.7 },
    { date: "2026-01", value: 56.8 },
    { date: "2026-02", value: 56.9 },
    { date: "2026-03", value: 57.1 },
  ],
  kr_treasury_outstanding: [
    { date: "2025-01", value: 940 },
    { date: "2025-02", value: 944 },
    { date: "2025-03", value: 948 },
    { date: "2025-04", value: 952 },
    { date: "2025-05", value: 956 },
    { date: "2025-06", value: 960 },
    { date: "2025-07", value: 964 },
    { date: "2025-08", value: 969 },
    { date: "2025-09", value: 973 },
    { date: "2025-10", value: 977 },
    { date: "2025-11", value: 981 },
    { date: "2025-12", value: 986 },
    { date: "2026-01", value: 991 },
    { date: "2026-02", value: 996 },
    { date: "2026-03", value: 1002 },
  ],
  kr_fiscal_balance: [
    { date: "2025-01", value: -8.2 },
    { date: "2025-02", value: -8.1 },
    { date: "2025-03", value: -8.0 },
    { date: "2025-04", value: -7.9 },
    { date: "2025-05", value: -7.9 },
    { date: "2025-06", value: -7.8 },
    { date: "2025-07", value: -7.7 },
    { date: "2025-08", value: -7.7 },
    { date: "2025-09", value: -7.6 },
    { date: "2025-10", value: -7.5 },
    { date: "2025-11", value: -7.5 },
    { date: "2025-12", value: -7.4 },
    { date: "2026-01", value: -7.3 },
    { date: "2026-02", value: -7.2 },
    { date: "2026-03", value: -7.1 },
  ],
  kr_cpi: [
    { date: "2025-01", value: 111.1 },
    { date: "2025-02", value: 111.3 },
    { date: "2025-03", value: 111.6 },
    { date: "2025-04", value: 111.8 },
    { date: "2025-05", value: 112.1 },
    { date: "2025-06", value: 112.4 },
    { date: "2025-07", value: 112.6 },
    { date: "2025-08", value: 112.9 },
    { date: "2025-09", value: 113.1 },
    { date: "2025-10", value: 113.3 },
    { date: "2025-11", value: 113.4 },
    { date: "2025-12", value: 113.6 },
    { date: "2026-01", value: 113.8 },
    { date: "2026-02", value: 114.1 },
    { date: "2026-03", value: 114.4 },
  ],
};

const HISTORY_BY_TOPIC = {
  rates: [
    { dateKst: "2026-02-25", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 2.2, sourceDiversity: 1, burstGrade: "Low" as const },
    { dateKst: "2026-02-26", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 2.1, sourceDiversity: 1, burstGrade: "Low" as const },
    { dateKst: "2026-02-27", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 2.0, sourceDiversity: 1, burstGrade: "Low" as const },
    { dateKst: "2026-02-28", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 2.0, sourceDiversity: 1, burstGrade: "Low" as const },
    { dateKst: "2026-03-01", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 2.3, sourceDiversity: 1, burstGrade: "Low" as const },
    { dateKst: "2026-03-02", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 2.2, sourceDiversity: 1, burstGrade: "Low" as const },
    { dateKst: "2026-03-03", topicId: "rates", topicLabel: "금리/통화정책", count: 1, scoreSum: 2.1, sourceDiversity: 1, burstGrade: "Low" as const },
  ],
  fx: Array.from({ length: 7 }, (_, idx) => ({
    dateKst: `2026-02-${String(25 + idx).padStart(2, "0")}`,
    topicId: "fx",
    topicLabel: "환율/대외",
    count: 1,
    scoreSum: 1.6,
    sourceDiversity: 1,
    burstGrade: "Low" as const,
  })),
  fiscal: Array.from({ length: 7 }, (_, idx) => ({
    dateKst: `2026-02-${String(25 + idx).padStart(2, "0")}`,
    topicId: "fiscal",
    topicLabel: "재정/세제",
    count: 0,
    scoreSum: 0,
    sourceDiversity: 0,
    burstGrade: "Low" as const,
  })),
} as Record<string, TrendTopicDailyStat[]>;

const PROFILE: ExposureProfile = {
  savedAt: "2026-03-04T12:00:00.000Z",
  debt: {
    hasDebt: "yes",
    rateType: "variable",
    repricingHorizon: "short",
  },
  inflation: {
    essentialExpenseShare: "high",
    rentOrMortgageShare: "medium",
    energyShare: "high",
  },
  fx: {
    foreignConsumption: "high",
    foreignIncome: "low",
  },
  income: {
    incomeStability: "moderate",
  },
  liquidity: {
    monthsOfCashBuffer: "low",
  },
};

function readIndicatorSeries(seriesId: string): Observation[] {
  return (SERIES[seriesId] ?? []).map((row) => ({ ...row }));
}

function mapScenarioIndicators(topicIds: string[]): string[] {
  const out = new Set<string>();
  for (const topicId of topicIds) {
    if (topicId === "rates") out.add("kr_base_rate");
    if (topicId === "inflation") out.add("kr_cpi");
    if (topicId === "fx") out.add("kr_usdkrw");
    if (topicId === "fiscal") out.add("kr_fiscal_balance");
    if (topicId === "commodities") out.add("brent_oil");
  }
  if (out.size < 1) out.add("kr_base_rate");
  return [...out];
}

function runFixturePipeline(): GoldenOutput {
  const topResult = selectTopFromItems(FIXTURE_ITEMS, {
    now: NOW,
    windowHours: 72,
    topN: 10,
    topM: 5,
  });

  const todayStats = computeDailyStats({
    items: FIXTURE_ITEMS,
    dateKst: DATE_KST,
    now: NOW,
    historyByTopic: HISTORY_BY_TOPIC,
  });
  const digestBurstTopics: DigestTopicDailyStat[] = todayStats.map((row) => ({
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    count: row.count,
    scoreSum: row.scoreSum,
    dateKst: DATE_KST,
    sourceDiversity: row.sourceDiversity,
    baselineMean: 0,
    baselineStddev: 0,
    burstZ: 0,
    burstGrade: row.burstGrade === "High"
      ? "상"
      : row.burstGrade === "Med"
        ? "중"
        : row.burstGrade === "Low"
          ? "하"
          : "Unknown",
  }));

  const digest = buildDigestFromInputs({
    generatedAt: NOW.toISOString(),
    dateRange: {
      fromKst: FROM_KST,
      toKst: DATE_KST,
    },
    topResult,
    burstTopics: digestBurstTopics,
    readIndicatorSeries,
  });

  const digestDay = buildDigestDay({
    date: DATE_KST,
    topResult,
    burstTopics: digestBurstTopics,
  });

  const scenarios = buildScenarios({
    digest: digestDay,
    trends: todayStats,
    generatedAt: NOW.toISOString(),
  });

  const alerts = evaluateAlerts({
    generatedAt: NOW.toISOString(),
    source: "news:refresh",
    rules: [
      {
        id: "topic_burst_mid",
        name: "토픽 급증(중 이상)",
        enabled: true,
        level: "medium",
        kind: "topic_burst",
        topicId: "*",
        minBurstLevel: "중",
        minTodayCount: 2,
      },
      {
        id: "indicator_fx_zscore_high",
        name: "환율 긴장 z-score",
        enabled: true,
        level: "high",
        kind: "indicator",
        seriesId: "kr_usdkrw",
        metric: "zscore",
        window: 6,
        condition: "high",
        threshold: 1.2,
        targetType: "topic",
        targetId: "fx",
      },
      {
        id: "indicator_rates_regime_up",
        name: "금리 상승 레짐",
        enabled: true,
        level: "medium",
        kind: "indicator",
        seriesId: "kr_base_rate",
        metric: "regime",
        window: 6,
        condition: "up",
        targetType: "scenario",
        targetId: "Bear",
      },
    ],
    topicTrends: todayStats.map((row) => ({
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      todayCount: row.count,
      burstLevel: row.burstGrade === "High" ? "상" : row.burstGrade === "Med" ? "중" : "하",
    })),
    seriesSnapshots: [
      { seriesId: "kr_usdkrw", observations: readIndicatorSeries("kr_usdkrw") },
      { seriesId: "kr_base_rate", observations: readIndicatorSeries("kr_base_rate") },
    ],
  });

  const impact = scenarios.cards.map((card) => {
    const series = mapScenarioIndicators(card.linkedTopics);
    const result = computeImpact({
      profile: PROFILE,
      scenario: {
        name: card.name,
        triggerStatus: card.name === "Bull" ? "not_met" : "met",
        linkedTopics: card.linkedTopics,
        confirmIndicators: series,
        leadingIndicators: series,
        observation: card.observation,
        triggerSummary: card.triggers.map((trigger) => `${trigger.kind}:${trigger.condition}`).join(", "),
      },
      indicatorGrades: {
        kr_base_rate: "up",
        kr_cpi: "up",
        kr_usdkrw: "high",
        kr_fiscal_balance: "flat",
      },
    });

    return {
      name: card.name,
      grades: {
        cashflowRisk: result.cashflowRisk,
        debtServiceRisk: result.debtServiceRisk,
        inflationPressureRisk: result.inflationPressureRisk,
        fxPressureRisk: result.fxPressureRisk,
        incomeRisk: result.incomeRisk,
        bufferAdequacy: result.bufferAdequacy,
      },
      rationale: result.rationale,
      watch: result.watch,
    };
  });

  return {
    digest: {
      dateRange: digest.dateRange,
      observationLines: digest.observationLines,
      watchlist: digest.watchlist.map((row) => ({
        label: row.label,
        seriesId: row.seriesId,
        status: row.status,
        grade: row.grade,
        compactSummary: row.compactSummary,
      })),
      evidence: digest.topItems.map((row) => ({
        title: row.title,
        url: row.url,
        topicId: row.primaryTopicId,
        score: row.totalScore,
        publishedAt: row.publishedAt,
      })),
      burstTopics: digest.burstTopics.map((row) => ({
        topicId: row.topicId,
        count: row.count,
        burstGrade: row.burstGrade === "상"
          ? "High"
          : row.burstGrade === "중"
            ? "Med"
            : row.burstGrade === "하"
              ? "Low"
              : row.burstGrade,
        scoreSum: row.scoreSum,
        sourceDiversity: row.sourceDiversity,
      })),
    },
    scenarios: scenarios.cards.map((row) => ({
      name: row.name,
      linkedTopics: row.linkedTopics,
      observation: row.observation,
      triggers: row.triggers.map((trigger) => ({
        kind: trigger.kind,
        topicId: trigger.topicId,
        condition: trigger.condition,
        note: trigger.note,
      })),
      invalidation: row.invalidation,
      options: row.options,
    })),
    alerts: alerts.map((row) => ({
      ruleId: row.ruleId,
      ruleKind: row.ruleKind,
      level: row.level,
      targetType: row.targetType,
      targetId: row.targetId,
      title: row.title,
      summary: row.summary,
      snapshotStatus: row.snapshot?.triggerStatus ?? "unknown",
    })),
    impact,
  };
}

function collectGeneratedTexts(output: GoldenOutput): string[] {
  const lines: string[] = [];
  lines.push(...output.digest.observationLines);
  lines.push(...output.digest.watchlist.map((row) => row.compactSummary));
  lines.push(...output.scenarios.flatMap((row) => [
    row.observation,
    ...row.invalidation,
    ...row.options,
    ...row.triggers.map((trigger) => trigger.note ?? ""),
  ]));
  lines.push(...output.alerts.flatMap((row) => [row.title, row.summary]));
  lines.push(...output.impact.flatMap((row) => row.rationale));
  return lines.filter(Boolean);
}

describe("planning v3 golden regression", () => {
  it("produces deterministic structured outputs for fixture pipeline", () => {
    const first = runFixturePipeline();
    const second = runFixturePipeline();
    expect(first).toStrictEqual(second);
  });

  it("matches golden snapshot for digest/scenarios/alerts/impact", () => {
    const output = runFixturePipeline();
    expect(output).toMatchSnapshot();
  });

  it("ensures all generated texts pass noRecommendationText policy", () => {
    const output = runFixturePipeline();
    const lines = collectGeneratedTexts(output);
    expect(lines.length).toBeGreaterThan(0);
    expect(() => assertNoRecommendationText(lines)).not.toThrow();
  });
});
