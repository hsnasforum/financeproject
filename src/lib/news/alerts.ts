import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { regime, pctChange, zscore } from "../../../planning/v3/indicators/analytics";
import { normalizeSeriesId } from "../../../planning/v3/indicators/aliases";
import { resolveDataDir } from "../planning/storage/dataDir.ts";
import { readIndicatorSeriesSnapshots } from "../indicators/query.ts";
import { type Observation, type SeriesSnapshot } from "../indicators/types.ts";
import { resolveNewsTrendsJsonPath } from "./storageSqlite.ts";
import { readNewsTopicTrends } from "./trendReader.ts";
import { type BurstLevel, type TopicTrend } from "./types.ts";

export type AlertRuleLevel = "high" | "medium" | "low";
export type AlertRuleCondition = "up" | "down" | "high" | "low" | "flat" | "unknown";

const AlertRuleBaseSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  level: z.enum(["high", "medium", "low"]).default("medium"),
});

const TopicBurstRuleSchema = AlertRuleBaseSchema.extend({
  kind: z.literal("topic_burst"),
  topicId: z.string().trim().min(1).default("*"),
  minBurstLevel: z.enum(["중", "상"]).default("중"),
  minTodayCount: z.number().int().nonnegative().default(1),
});

const IndicatorRuleSchema = AlertRuleBaseSchema.extend({
  kind: z.literal("indicator"),
  seriesId: z.string().trim().min(1),
  metric: z.enum(["pctChange", "zscore", "regime"]),
  window: z.number().int().positive().max(365).default(12),
  condition: z.enum(["up", "down", "high", "low", "flat", "unknown"]),
  threshold: z.number().finite().optional(),
  targetType: z.enum(["topic", "item", "scenario", "series"]).optional(),
  targetId: z.string().trim().min(1).optional(),
});

const AlertRuleSchema = z.discriminatedUnion("kind", [
  TopicBurstRuleSchema,
  IndicatorRuleSchema,
]);

export type AlertRule = z.infer<typeof AlertRuleSchema>;

const AlertRulesConfigSchema = z.object({
  version: z.number().int().positive().default(1),
  generatedAt: z.string().datetime().optional(),
  rules: z.array(AlertRuleSchema).default([]),
});

const AlertRuleOverrideSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  level: z.enum(["high", "medium", "low"]).optional(),
  topicId: z.string().trim().min(1).optional(),
  minBurstLevel: z.enum(["중", "상"]).optional(),
  minTodayCount: z.number().int().nonnegative().optional(),
  seriesId: z.string().trim().min(1).optional(),
  metric: z.enum(["pctChange", "zscore", "regime"]).optional(),
  window: z.number().int().positive().max(365).optional(),
  condition: z.enum(["up", "down", "high", "low", "flat", "unknown"]).optional(),
  threshold: z.number().finite().optional(),
  targetType: z.enum(["topic", "item", "scenario", "series"]).optional(),
  targetId: z.string().trim().min(1).optional(),
});

const AlertRuleOverridesSchema = z.object({
  updatedAt: z.string().datetime().optional(),
  rules: z.array(AlertRuleOverrideSchema).default([]),
});

export type AlertRuleOverride = z.infer<typeof AlertRuleOverrideSchema>;

const AlertEventSchema = z.object({
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
  topicId: z.string().trim().min(1).optional(),
  seriesId: z.string().trim().min(1).optional(),
  metric: z.enum(["pctChange", "zscore", "regime"]).optional(),
  value: z.number().finite().optional(),
  valueText: z.string().trim().min(1).optional(),
  burstLevel: z.enum(["상", "중", "하"]).optional(),
});

export type AlertEvent = z.infer<typeof AlertEventSchema>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatSigned(value: number): string {
  const rounded = round2(value);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

function formatKstDay(isoLike: string): string {
  const date = new Date(asString(isoLike));
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(safe);
  const y = parts.find((row) => row.type === "year")?.value ?? "0000";
  const m = parts.find((row) => row.type === "month")?.value ?? "01";
  const d = parts.find((row) => row.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function shiftKstDay(dayKst: string, deltaDays: number): string {
  const [year, month, day] = dayKst.split("-").map((token) => Number(token));
  const baseUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const shifted = new Date(baseUtc + deltaDays * 24 * 60 * 60 * 1000);
  const yyyy = String(shifted.getUTCFullYear());
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function burstRank(level: BurstLevel): number {
  if (level === "상") return 2;
  if (level === "중") return 1;
  return 0;
}

function topicLink(topicId: string): string {
  return `/planning/v3/news/trends?topic=${encodeURIComponent(topicId)}`;
}

function scenarioLink(scenarioId: string): string {
  return `/planning/v3/news#scenario-${encodeURIComponent(scenarioId)}`;
}

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function eventId(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function readAlertEventLine(line: string): AlertEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return AlertEventSchema.parse(JSON.parse(trimmed) as unknown);
  } catch {
    return null;
  }
}

function defaultRulesConfig(): z.infer<typeof AlertRulesConfigSchema> {
  return {
    version: 1,
    generatedAt: undefined,
    rules: [],
  };
}

function defaultOverrides(): z.infer<typeof AlertRuleOverridesSchema> {
  return {
    updatedAt: undefined,
    rules: [],
  };
}

export function resolveAlertsDataDir(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "alerts");
}

export function resolveAlertEventsPath(cwd = process.cwd()): string {
  return path.join(resolveAlertsDataDir(cwd), "events.jsonl");
}

export function resolveAlertRulesOverridePath(cwd = process.cwd()): string {
  return path.join(resolveAlertsDataDir(cwd), "rules.override.json");
}

export function resolveAlertRulesConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, "config", "news-alert-rules.json");
}

export function readAlertRulesConfig(cwd = process.cwd()): z.infer<typeof AlertRulesConfigSchema> {
  const filePath = resolveAlertRulesConfigPath(cwd);
  const parsed = readJson(filePath, defaultRulesConfig());
  const validated = AlertRulesConfigSchema.safeParse(parsed);
  if (!validated.success) return defaultRulesConfig();
  return validated.data;
}

export function readAlertRuleOverrides(cwd = process.cwd()): z.infer<typeof AlertRuleOverridesSchema> {
  const filePath = resolveAlertRulesOverridePath(cwd);
  const parsed = readJson(filePath, defaultOverrides());
  const validated = AlertRuleOverridesSchema.safeParse(parsed);
  if (!validated.success) return defaultOverrides();
  return validated.data;
}

export function writeAlertRuleOverrides(input: {
  rules: AlertRuleOverride[];
}, cwd = process.cwd()): z.infer<typeof AlertRuleOverridesSchema> {
  const next = AlertRuleOverridesSchema.parse({
    updatedAt: new Date().toISOString(),
    rules: input.rules,
  });

  const dir = resolveAlertsDataDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolveAlertRulesOverridePath(cwd), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}

export function loadEffectiveAlertRules(cwd = process.cwd()): AlertRule[] {
  const defaults = readAlertRulesConfig(cwd);
  const overrides = readAlertRuleOverrides(cwd);
  const overrideById = new Map(overrides.rules.map((row) => [row.id, row]));

  const merged: AlertRule[] = [];
  for (const rule of defaults.rules) {
    const override = overrideById.get(rule.id);
    if (!override) {
      merged.push(rule);
      continue;
    }
    const next = {
      ...rule,
      ...override,
      id: rule.id,
      kind: rule.kind,
      name: rule.name,
    };
    const parsed = AlertRuleSchema.safeParse(next);
    if (!parsed.success) {
      merged.push(rule);
      continue;
    }
    merged.push(parsed.data);
  }

  return merged;
}

export function readAlertEvents(cwd = process.cwd()): AlertEvent[] {
  const filePath = resolveAlertEventsPath(cwd);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  const out: AlertEvent[] = [];
  for (const line of lines) {
    const row = readAlertEventLine(line);
    if (!row) continue;
    out.push(row);
  }
  out.sort((a, b) => {
    const left = Date.parse(a.createdAt);
    const right = Date.parse(b.createdAt);
    if (left !== right) return right - left;
    return b.id.localeCompare(a.id);
  });
  return out;
}

export function appendAlertEvents(events: AlertEvent[], cwd = process.cwd()): { appended: number; total: number } {
  if (events.length < 1) return { appended: 0, total: readAlertEvents(cwd).length };

  const filePath = resolveAlertEventsPath(cwd);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const existingIds = new Set(readAlertEvents(cwd).map((row) => row.id));
  const nextRows = events
    .map((row) => AlertEventSchema.parse(row))
    .filter((row) => !existingIds.has(row.id));

  if (nextRows.length > 0) {
    const payload = nextRows.map((row) => JSON.stringify(row)).join("\n");
    fs.appendFileSync(filePath, `${payload}\n`, "utf-8");
  }

  return {
    appended: nextRows.length,
    total: existingIds.size + nextRows.length,
  };
}

function readSnapshotsBySeriesId(cwd: string, rules: AlertRule[]): Map<string, SeriesSnapshot> {
  const seriesIds = [...new Set(rules
    .filter((row): row is z.infer<typeof IndicatorRuleSchema> => row.kind === "indicator")
    .map((row) => normalizeSeriesId(row.seriesId))
    .filter(Boolean))];

  const snapshots = readIndicatorSeriesSnapshots({ cwd, seriesIds });
  const bySeriesId = new Map<string, SeriesSnapshot>();
  for (const snapshot of snapshots) {
    const normalized = normalizeSeriesId(snapshot.seriesId);
    if (!normalized) continue;
    bySeriesId.set(normalized, snapshot);
  }
  return bySeriesId;
}

function evaluateNumericCondition(input: {
  metric: "pctChange" | "zscore";
  value: number;
  condition: AlertRuleCondition;
  threshold?: number;
}): boolean {
  const value = input.value;
  const threshold = Number.isFinite(input.threshold)
    ? Number(input.threshold)
    : input.metric === "zscore"
      ? 2
      : 0;

  if (input.condition === "up") return value > threshold;
  if (input.condition === "down") return value < -threshold;
  if (input.condition === "high") {
    const highThreshold = Number.isFinite(input.threshold)
      ? Number(input.threshold)
      : input.metric === "zscore" ? 2 : 2;
    return value >= highThreshold;
  }
  if (input.condition === "low") {
    const lowThreshold = Number.isFinite(input.threshold)
      ? Number(input.threshold)
      : input.metric === "zscore" ? 2 : 2;
    return value <= -lowThreshold;
  }
  if (input.condition === "flat") {
    const flatThreshold = Number.isFinite(input.threshold) ? Math.abs(Number(input.threshold)) : 0.5;
    return Math.abs(value) <= flatThreshold;
  }
  return false;
}

function evaluateRegimeCondition(current: string, condition: AlertRuleCondition): boolean {
  if (condition === "high") return current === "up";
  if (condition === "low") return current === "down";
  return current === condition;
}

function evaluateTopicBurstRule(input: {
  rule: z.infer<typeof TopicBurstRuleSchema>;
  trends: TopicTrend[];
  source: "news:refresh" | "indicators:refresh";
  generatedAt: string;
  dayKst: string;
}): AlertEvent[] {
  const minRank = burstRank(input.rule.minBurstLevel);
  const rows = (input.rule.topicId === "*" ? input.trends : input.trends.filter((row) => row.topicId === input.rule.topicId))
    .filter((row) => row.todayCount >= input.rule.minTodayCount)
    .filter((row) => burstRank(row.burstLevel) >= minRank);

  return rows.map((row) => AlertEventSchema.parse({
    id: eventId(`${input.dayKst}|${input.rule.id}|topic|${row.topicId}`),
    createdAt: input.generatedAt,
    dayKst: input.dayKst,
    source: input.source,
    ruleId: input.rule.id,
    ruleKind: input.rule.kind,
    level: input.rule.level,
    title: `${input.rule.name}: ${row.topicLabel} (${row.burstLevel})`,
    summary: `today=${row.todayCount}, delta=${row.delta}, ratio=${round2(row.ratio)}, z=${round2(row.burstZ)}`,
    targetType: "topic",
    targetId: row.topicId,
    link: topicLink(row.topicId),
    topicId: row.topicId,
    burstLevel: row.burstLevel,
  }));
}

function metricValue(input: {
  metric: "pctChange" | "zscore" | "regime";
  observations: Observation[];
  window: number;
}): number | string | null {
  if (input.metric === "pctChange") return pctChange(input.observations, input.window);
  if (input.metric === "zscore") return zscore(input.observations, input.window);
  return regime(input.observations, input.window);
}

function evaluateIndicatorRule(input: {
  rule: z.infer<typeof IndicatorRuleSchema>;
  snapshotsBySeriesId: Map<string, SeriesSnapshot>;
  source: "news:refresh" | "indicators:refresh";
  generatedAt: string;
  dayKst: string;
}): AlertEvent[] {
  const seriesId = normalizeSeriesId(input.rule.seriesId);
  if (!seriesId) return [];
  const snapshot = input.snapshotsBySeriesId.get(seriesId);
  if (!snapshot || snapshot.observations.length < 1) return [];

  const value = metricValue({
    metric: input.rule.metric,
    observations: snapshot.observations,
    window: input.rule.window,
  });
  if (value === null) return [];

  let matched = false;
  let valueText = "";
  let numericValue: number | undefined;

  if (input.rule.metric === "regime") {
    const regimeValue = asString(value);
    matched = evaluateRegimeCondition(regimeValue, input.rule.condition);
    valueText = `regime=${regimeValue}`;
  } else {
    const metricNumber = asNumber(value, Number.NaN);
    if (!Number.isFinite(metricNumber)) return [];
    matched = evaluateNumericCondition({
      metric: input.rule.metric,
      value: metricNumber,
      condition: input.rule.condition,
      threshold: input.rule.threshold,
    });
    valueText = `${input.rule.metric}=${formatSigned(metricNumber)}`;
    numericValue = round2(metricNumber);
  }

  if (!matched) return [];

  const targetType = input.rule.targetType ?? "series";
  const targetId = asString(input.rule.targetId) || seriesId;
  const link = targetType === "topic"
    ? topicLink(targetId)
    : targetType === "scenario"
      ? scenarioLink(targetId)
      : targetType === "item" && isUrlLike(targetId)
        ? targetId
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
    summary: `${valueText}, condition=${input.rule.condition}, asOf=${snapshot.observations[snapshot.observations.length - 1]?.date ?? "-"}`,
    targetType,
    targetId,
    link,
    seriesId,
    metric: input.rule.metric,
    ...(typeof numericValue === "number" ? { value: numericValue } : {}),
    valueText,
  })];
}

export function evaluateAlertEvents(input: {
  cwd?: string;
  generatedAt?: string;
  source: "news:refresh" | "indicators:refresh";
}): { events: AlertEvent[]; rules: AlertRule[] } {
  const cwd = input.cwd ?? process.cwd();
  const generatedAt = asString(input.generatedAt) || new Date().toISOString();
  const dayKst = formatKstDay(generatedAt);
  const rules = loadEffectiveAlertRules(cwd).filter((row) => row.enabled !== false);

  const trends = readNewsTopicTrends(resolveNewsTrendsJsonPath(cwd))?.topics ?? [];
  const snapshotsBySeriesId = readSnapshotsBySeriesId(cwd, rules);

  const events: AlertEvent[] = [];
  for (const rule of rules) {
    if (rule.kind === "topic_burst") {
      events.push(...evaluateTopicBurstRule({
        rule,
        trends,
        source: input.source,
        generatedAt,
        dayKst,
      }));
      continue;
    }

    events.push(...evaluateIndicatorRule({
      rule,
      snapshotsBySeriesId,
      source: input.source,
      generatedAt,
      dayKst,
    }));
  }

  events.sort((a, b) => {
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId);
    if (a.targetType !== b.targetType) return a.targetType.localeCompare(b.targetType);
    return a.targetId.localeCompare(b.targetId);
  });

  return {
    events,
    rules,
  };
}

export function evaluateAndAppendAlertEvents(input: {
  cwd?: string;
  generatedAt?: string;
  source: "news:refresh" | "indicators:refresh";
}): {
  evaluated: number;
  appended: number;
  total: number;
  events: AlertEvent[];
  rulesCount: number;
} {
  const cwd = input.cwd ?? process.cwd();
  const evaluated = evaluateAlertEvents({
    cwd,
    generatedAt: input.generatedAt,
    source: input.source,
  });
  const appended = appendAlertEvents(evaluated.events, cwd);

  return {
    evaluated: evaluated.events.length,
    appended: appended.appended,
    total: appended.total,
    events: evaluated.events,
    rulesCount: evaluated.rules.length,
  };
}

export function readRecentAlertEvents(input: {
  cwd?: string;
  days?: number;
  nowIso?: string;
} = {}): AlertEvent[] {
  const cwd = input.cwd ?? process.cwd();
  const days = Math.max(1, Math.min(90, Math.round(asNumber(input.days, 14))));
  const nowIso = asString(input.nowIso) || new Date().toISOString();
  const todayKst = formatKstDay(nowIso);
  const fromKst = shiftKstDay(todayKst, -(days - 1));
  return readAlertEvents(cwd).filter((row) => row.dayKst >= fromKst && row.dayKst <= todayKst);
}

export function groupAlertEventsByDay(events: AlertEvent[]): Array<{ dayKst: string; events: AlertEvent[] }> {
  const byDay = new Map<string, AlertEvent[]>();
  for (const row of events) {
    const bucket = byDay.get(row.dayKst) ?? [];
    bucket.push(row);
    byDay.set(row.dayKst, bucket);
  }

  const out = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKst, rows]) => ({
      dayKst,
      events: rows.sort((left, right) => {
        const l = Date.parse(left.createdAt);
        const r = Date.parse(right.createdAt);
        if (l !== r) return r - l;
        return right.id.localeCompare(left.id);
      }),
    }));

  return out;
}
