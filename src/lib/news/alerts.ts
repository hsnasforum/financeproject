import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { regime, pctChange, zscore } from "../../../planning/v3/indicators/analytics";
import { normalizeSeriesId } from "../../../planning/v3/indicators/aliases";
import { evaluateAlerts as evaluateAlertsV3 } from "../../../planning/v3/alerts/evaluateAlerts";
import {
  appendAlertEvents as appendAlertEventsV3,
  groupAlertEventsByDay as groupAlertEventsByDayV3,
  readAlertEvents as readAlertEventsV3,
  readRecentAlertEvents as readRecentAlertEventsV3,
  resolveAlertEventsPath as resolveAlertEventsPathV3,
} from "../../../planning/v3/alerts/store";
import {
  getPlanningUserDir,
  isPlanningNamespaceEnabled,
  resolvePlanningUserId,
} from "../planning/store/namespace.ts";
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
  snapshot: z.object({
    triggerStatus: z.enum(["met", "not_met", "unknown"]).optional(),
    burstLevel: z.enum(["상", "중", "하", "unknown"]).optional(),
    indicator: z.object({
      metric: z.enum(["pctChange", "zscore", "regime"]),
      condition: z.enum(["up", "down", "high", "low", "flat", "unknown"]),
      status: z.enum(["met", "not_met", "unknown"]),
    }).optional(),
  }).optional(),
});

export type AlertEvent = z.infer<typeof AlertEventSchema>;

const AlertEventStateItemSchema = z.object({
  id: z.string().trim().min(1),
  acknowledgedAt: z.string().datetime().optional(),
  hiddenAt: z.string().datetime().optional(),
});

const AlertEventStateStoreSchema = z.object({
  updatedAt: z.string().datetime().optional(),
  items: z.array(AlertEventStateItemSchema).default([]),
});

export type AlertEventStateItem = z.infer<typeof AlertEventStateItemSchema>;
export type AlertEventStateStore = z.infer<typeof AlertEventStateStoreSchema>;
export type AlertEventStateAction = "ack" | "unack" | "hide" | "unhide";

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

void formatKstDay;
void shiftKstDay;
void readAlertEventLine;

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

function defaultAlertEventStateStore(): AlertEventStateStore {
  return {
    updatedAt: undefined,
    items: [],
  };
}

export function resolveAlertsDataDir(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "alerts");
}

export function resolveAlertEventsPath(cwd = process.cwd()): string {
  return resolveAlertEventsPathV3(resolveAlertsDataDir(cwd));
}

function resolveLegacyAlertEventStatePath(cwd = process.cwd()): string {
  return path.join(resolveAlertsDataDir(cwd), "event-state.json");
}

function resolveScopedAlertEventStatePath(cwd = process.cwd()): string {
  if (!isPlanningNamespaceEnabled()) return resolveLegacyAlertEventStatePath(cwd);
  const userId = resolvePlanningUserId();
  return path.join(getPlanningUserDir(userId, cwd), "news", "alerts", "event-state.json");
}

export function resolveAlertEventStatePath(cwd = process.cwd()): string {
  return resolveScopedAlertEventStatePath(cwd);
}

export function resolveAlertRulesOverridePath(cwd = process.cwd()): string {
  return path.join(resolveAlertsDataDir(cwd), "rules.override.json");
}

export function resolveAlertRulesConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, "config", "news-alert-rules.json");
}

function normalizeAlertEventStateItems(items: AlertEventStateItem[]): AlertEventStateItem[] {
  const byId = new Map<string, AlertEventStateItem>();
  for (const row of items) {
    const parsed = AlertEventStateItemSchema.parse(row);
    const normalized = AlertEventStateItemSchema.parse({
      id: parsed.id,
      ...(parsed.acknowledgedAt ? { acknowledgedAt: parsed.acknowledgedAt } : {}),
      ...(parsed.hiddenAt ? { hiddenAt: parsed.hiddenAt } : {}),
    });
    if (!normalized.acknowledgedAt && !normalized.hiddenAt) {
      byId.delete(normalized.id);
      continue;
    }
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function readAlertEventState(cwd = process.cwd()): AlertEventStateStore {
  const primaryPath = resolveAlertEventStatePath(cwd);
  const legacyPath = resolveLegacyAlertEventStatePath(cwd);
  const candidates = primaryPath === legacyPath ? [primaryPath] : [primaryPath, legacyPath];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = readJson(filePath, defaultAlertEventStateStore());
    const validated = AlertEventStateStoreSchema.safeParse(parsed);
    if (!validated.success) continue;

    const normalized = {
      updatedAt: validated.data.updatedAt,
      items: normalizeAlertEventStateItems(validated.data.items),
    };

    if (filePath !== primaryPath) {
      writeAlertEventState({ items: normalized.items }, cwd);
    }
    return normalized;
  }

  return defaultAlertEventStateStore();
}

export function writeAlertEventState(input: {
  items: AlertEventStateItem[];
}, cwd = process.cwd()): AlertEventStateStore {
  const next = AlertEventStateStoreSchema.parse({
    updatedAt: new Date().toISOString(),
    items: normalizeAlertEventStateItems(input.items),
  });

  const filePath = resolveAlertEventStatePath(cwd);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}

export function updateAlertEventState(input: {
  action: AlertEventStateAction;
  id: string;
}, cwd = process.cwd()): AlertEventStateStore {
  const id = asString(input.id);
  if (!id) {
    return readAlertEventState(cwd);
  }

  const current = readAlertEventState(cwd);
  const byId = new Map(current.items.map((row) => [row.id, { ...row }]));
  const next = byId.get(id) ?? { id };
  const nowIso = new Date().toISOString();

  if (input.action === "ack") next.acknowledgedAt = nowIso;
  if (input.action === "unack") delete next.acknowledgedAt;
  if (input.action === "hide") next.hiddenAt = nowIso;
  if (input.action === "unhide") delete next.hiddenAt;

  if (!next.acknowledgedAt && !next.hiddenAt) {
    byId.delete(id);
  } else {
    byId.set(id, AlertEventStateItemSchema.parse(next));
  }

  return writeAlertEventState({ items: [...byId.values()] }, cwd);
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
  return readAlertEventsV3(resolveAlertsDataDir(cwd))
    .map((row) => AlertEventSchema.parse(row));
}

export function appendAlertEvents(events: AlertEvent[], cwd = process.cwd()): { appended: number; total: number } {
  const result = appendAlertEventsV3({
    events: events.map((row) => AlertEventSchema.parse(row)),
    rootDir: resolveAlertsDataDir(cwd),
    dedupWindowMinutes: 180,
  });
  return {
    appended: result.appended,
    total: result.total,
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

function metricLabel(metric: "pctChange" | "zscore" | "regime"): string {
  if (metric === "pctChange") return "변화율";
  if (metric === "zscore") return "표준점수";
  return "추세";
}

function conditionLabel(condition: AlertRuleCondition): string {
  if (condition === "up") return "상승";
  if (condition === "down") return "하락";
  if (condition === "high") return "고점권";
  if (condition === "low") return "저점권";
  if (condition === "flat") return "횡보";
  return "데이터 부족";
}

function regimeLabel(value: string): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "up") return "상승";
  if (normalized === "down") return "하락";
  if (normalized === "flat") return "횡보";
  return normalized || "데이터 부족";
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
    summary: `당일 기사 수 ${row.todayCount}건 · 전일 대비 ${row.delta}건 · 증가 배율 ${round2(row.ratio)}배 · 급증 지수 ${round2(row.burstZ)}`,
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
    valueText = `${metricLabel(input.rule.metric)} ${regimeLabel(regimeValue)}`;
  } else {
    const metricNumber = asNumber(value, Number.NaN);
    if (!Number.isFinite(metricNumber)) return [];
    matched = evaluateNumericCondition({
      metric: input.rule.metric,
      value: metricNumber,
      condition: input.rule.condition,
      threshold: input.rule.threshold,
    });
    valueText = `${metricLabel(input.rule.metric)} ${formatSigned(metricNumber)}`;
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
    summary: `${valueText} · 조건 ${conditionLabel(input.rule.condition)} 충족 · 기준일 ${snapshot.observations[snapshot.observations.length - 1]?.date ?? "-"}`,
    targetType,
    targetId,
    link,
    seriesId,
    metric: input.rule.metric,
    ...(typeof numericValue === "number" ? { value: numericValue } : {}),
    valueText,
  })];
}

void evaluateTopicBurstRule;
void evaluateIndicatorRule;

export function evaluateAlertEvents(input: {
  cwd?: string;
  generatedAt?: string;
  source: "news:refresh" | "indicators:refresh";
}): { events: AlertEvent[]; rules: AlertRule[] } {
  const cwd = input.cwd ?? process.cwd();
  const generatedAt = asString(input.generatedAt) || new Date().toISOString();
  const rules = loadEffectiveAlertRules(cwd).filter((row) => row.enabled !== false);
  const trends = readNewsTopicTrends(resolveNewsTrendsJsonPath(cwd))?.topics ?? [];
  const snapshotsBySeriesId = readSnapshotsBySeriesId(cwd, rules);
  const events = evaluateAlertsV3({
    generatedAt,
    source: input.source,
    rules,
    topicTrends: trends.map((row) => ({
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      todayCount: row.todayCount,
      burstLevel: row.burstLevel,
    })),
    seriesSnapshots: [...snapshotsBySeriesId.values()].map((row) => ({
      seriesId: row.seriesId,
      observations: row.observations,
    })),
  }).map((row) => AlertEventSchema.parse(row));

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
  return readRecentAlertEventsV3({
    rootDir: resolveAlertsDataDir(cwd),
    days: input.days,
    nowIso: input.nowIso,
  }).map((row) => AlertEventSchema.parse(row));
}

export function groupAlertEventsByDay(events: AlertEvent[]): Array<{ dayKst: string; events: AlertEvent[] }> {
  const normalized = events.map((row) => AlertEventSchema.parse(row));
  return groupAlertEventsByDayV3(normalized)
    .map((group) => ({
      dayKst: group.dayKst,
      events: group.events.map((row) => AlertEventSchema.parse(row)),
    }));
}
