import crypto from "node:crypto";
import { normalizeSeriesId } from "../indicators/aliases";
import { pctChange, regime, zscore } from "../indicators/analytics";
import {
  AlertEventSchema,
  EvaluateAlertsInputSchema,
  type AlertCondition,
  type AlertEvent,
  type AlertMetric,
  type IndicatorRule,
  type TopicBurstRule,
} from "./contracts";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatKstDay(isoLike: string): string {
  const parsed = Date.parse(asString(isoLike));
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((row) => row.type === "year")?.value ?? "0000";
  const month = parts.find((row) => row.type === "month")?.value ?? "01";
  const day = parts.find((row) => row.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function burstRank(level: "상" | "중" | "하"): number {
  if (level === "상") return 2;
  if (level === "중") return 1;
  return 0;
}

function conditionLabel(value: AlertCondition): string {
  if (value === "up") return "상승";
  if (value === "down") return "하락";
  if (value === "high") return "고점권";
  if (value === "low") return "저점권";
  if (value === "flat") return "횡보";
  return "데이터 부족";
}

function metricLabel(metric: AlertMetric): string {
  if (metric === "pctChange") return "변화율";
  if (metric === "zscore") return "표준점수";
  return "추세";
}

function eventId(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function topicLink(topicId: string): string {
  return `/planning/v3/news/trends?topic=${encodeURIComponent(topicId)}`;
}

function scenarioLink(scenarioId: string): string {
  return `/planning/v3/news#scenario-${encodeURIComponent(scenarioId)}`;
}

function evaluateNumeric(input: {
  metric: "pctChange" | "zscore";
  value: number;
  condition: AlertCondition;
  threshold?: number;
}): boolean {
  const threshold = Number.isFinite(input.threshold)
    ? Number(input.threshold)
    : input.metric === "zscore"
      ? 2
      : 0;

  if (input.condition === "up") return input.value > threshold;
  if (input.condition === "down") return input.value < -threshold;
  if (input.condition === "high") return input.value >= threshold;
  if (input.condition === "low") return input.value <= -threshold;
  if (input.condition === "flat") {
    const flatThreshold = Number.isFinite(input.threshold) ? Math.abs(Number(input.threshold)) : 0.5;
    return Math.abs(input.value) <= flatThreshold;
  }
  return false;
}

function evaluateRegime(value: string, condition: AlertCondition): boolean {
  const normalized = asString(value).toLowerCase();
  if (condition === "high") return normalized === "up";
  if (condition === "low") return normalized === "down";
  if (condition === "unknown") return normalized === "unknown";
  return normalized === condition;
}

function metricValue(input: {
  metric: AlertMetric;
  observations: Array<{ date: string; value: number }>;
  window: number;
}): number | string | null {
  if (input.metric === "pctChange") return pctChange(input.observations, input.window);
  if (input.metric === "zscore") return zscore(input.observations, input.window);
  return regime(input.observations, input.window);
}

function evaluateTopicRule(input: {
  rule: TopicBurstRule;
  trends: Array<{ topicId: string; topicLabel: string; todayCount: number; burstLevel: "상" | "중" | "하" }>;
  source: "news:refresh" | "indicators:refresh";
  generatedAt: string;
  dayKst: string;
}): AlertEvent[] {
  const minRank = burstRank(input.rule.minBurstLevel);
  const targets = (input.rule.topicId === "*" ? input.trends : input.trends.filter((row) => row.topicId === input.rule.topicId))
    .filter((row) => row.todayCount >= input.rule.minTodayCount)
    .filter((row) => burstRank(row.burstLevel) >= minRank);

  return targets.map((row) => AlertEventSchema.parse({
    id: eventId(`${input.dayKst}|${input.rule.id}|topic|${row.topicId}`),
    createdAt: input.generatedAt,
    dayKst: input.dayKst,
    source: input.source,
    ruleId: input.rule.id,
    ruleKind: input.rule.kind,
    level: input.rule.level,
    title: `${input.rule.name}: ${row.topicLabel}`,
    summary: `토픽 급증 조건이 충족되었습니다 (등급 ${row.burstLevel}).`,
    targetType: "topic",
    targetId: row.topicId,
    link: topicLink(row.topicId),
    topicId: row.topicId,
    snapshot: {
      triggerStatus: "met",
      burstLevel: row.burstLevel,
    },
  }));
}

function evaluateIndicatorRule(input: {
  rule: IndicatorRule;
  seriesSnapshots: Array<{ seriesId: string; observations: Array<{ date: string; value: number }> }>;
  source: "news:refresh" | "indicators:refresh";
  generatedAt: string;
  dayKst: string;
}): AlertEvent[] {
  const seriesId = normalizeSeriesId(input.rule.seriesId);
  if (!seriesId) return [];
  const series = input.seriesSnapshots.find((row) => normalizeSeriesId(row.seriesId) === seriesId);
  if (!series || series.observations.length < 1) return [];

  const measured = metricValue({
    metric: input.rule.metric,
    observations: series.observations,
    window: input.rule.window,
  });
  if (measured === null) return [];

  const matched = input.rule.metric === "regime"
    ? evaluateRegime(asString(measured), input.rule.condition)
    : evaluateNumeric({
      metric: input.rule.metric,
      value: Number(measured),
      condition: input.rule.condition,
      threshold: input.rule.threshold,
    });

  if (!matched) return [];

  const targetType = input.rule.targetType ?? "series";
  const targetId = asString(input.rule.targetId) || seriesId;
  const link = targetType === "topic"
    ? topicLink(targetId)
    : targetType === "scenario"
      ? scenarioLink(targetId)
      : "/planning/v3/news";

  return [AlertEventSchema.parse({
    id: eventId(`${input.dayKst}|${input.rule.id}|${targetType}|${targetId}`),
    createdAt: input.generatedAt,
    dayKst: input.dayKst,
    source: input.source,
    ruleId: input.rule.id,
    ruleKind: input.rule.kind,
    level: input.rule.level,
    title: `${input.rule.name}: ${seriesId}`,
    summary: `${metricLabel(input.rule.metric)} ${conditionLabel(input.rule.condition)} 조건이 충족되었습니다.`,
    targetType,
    targetId,
    link,
    seriesId,
    snapshot: {
      triggerStatus: "met",
      indicator: {
        metric: input.rule.metric,
        condition: input.rule.condition,
        status: "met",
      },
    },
  })];
}

export function evaluateAlerts(rawInput: unknown): AlertEvent[] {
  const input = EvaluateAlertsInputSchema.parse(rawInput);
  const dayKst = formatKstDay(input.generatedAt);

  const events: AlertEvent[] = [];
  for (const rule of input.rules) {
    if (rule.enabled === false) continue;
    if (rule.kind === "topic_burst") {
      events.push(...evaluateTopicRule({
        rule,
        trends: input.topicTrends,
        source: input.source,
        generatedAt: input.generatedAt,
        dayKst,
      }));
      continue;
    }

    events.push(...evaluateIndicatorRule({
      rule,
      seriesSnapshots: input.seriesSnapshots,
      source: input.source,
      generatedAt: input.generatedAt,
      dayKst,
    }));
  }

  events.sort((a, b) => {
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId);
    if (a.targetType !== b.targetType) return a.targetType.localeCompare(b.targetType);
    return a.targetId.localeCompare(b.targetId);
  });

  return events;
}
