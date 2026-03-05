import { type SeriesSnapshot } from "../indicators/types.ts";

export type TriggerStatus = "met" | "not_met" | "unknown";

export type ScenarioTriggerRule = {
  label: string;
  expression: string;
};

export type ScenarioTriggerEval = {
  label: string;
  expression: string;
  status: TriggerStatus;
  summary: string;
};

type ParsedRule = {
  metric: "pctChange" | "zscore";
  seriesId: string;
  window: number;
  comparator: ">" | ">=" | "<" | "<=" | "==";
  threshold: number;
};

const RULE_PATTERN = /^(pctChange|zscore)\(([A-Za-z0-9_\-]+)\s*,\s*(\d+)\)\s*(>=|<=|>|<|==)\s*([A-Za-z0-9+\-.]+)$/;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatSigned(value: number): string {
  const rounded = round2(value);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

function metricLabel(metric: ParsedRule["metric"]): string {
  if (metric === "pctChange") return "변화율";
  return "표준점수";
}

function metricUnit(metric: ParsedRule["metric"]): string {
  if (metric === "pctChange") return "%";
  return "σ";
}

function seriesLabel(seriesId: string): string {
  const normalized = asString(seriesId).toLowerCase();
  if (normalized === "kr_usdkrw") return "원/달러 환율";
  if (normalized === "kr_base_rate") return "기준금리";
  if (normalized === "kr_m2") return "M2 통화량";
  if (normalized === "us_cpi") return "미국 CPI";
  return seriesId;
}

function normalizeTriggerLabel(value: string): string {
  const label = asString(value) || "트리거";
  return label
    .replace(/z-score/gi, "표준점수")
    .replace(/zscore/gi, "표준점수")
    .replace(/pctchange/gi, "변화율");
}

function thresholdTokenToNumber(token: string): number | null {
  const normalized = token.trim().toLowerCase();
  if (normalized === "high") return 2;
  if (normalized === "mid") return 1;
  if (normalized === "low") return 0;
  return asNumber(token);
}

function parseRule(expression: string): ParsedRule | null {
  const normalized = asString(expression);
  const match = normalized.match(RULE_PATTERN);
  if (!match) return null;

  const metric = match[1] as ParsedRule["metric"];
  const seriesId = asString(match[2]);
  const window = Math.max(1, Math.min(365, Math.round(Number(match[3]))));
  const comparator = match[4] as ParsedRule["comparator"];
  const threshold = thresholdTokenToNumber(match[5]);
  if (!seriesId || !Number.isFinite(window) || threshold === null) return null;

  return {
    metric,
    seriesId,
    window,
    comparator,
    threshold,
  };
}

export function extractSeriesIdFromExpression(expression: string): string | null {
  const parsed = parseRule(expression);
  if (!parsed) return null;
  return parsed.seriesId;
}

export function extractSeriesIdsFromRules(rules: ScenarioTriggerRule[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rules) {
    const seriesId = extractSeriesIdFromExpression(row.expression);
    if (!seriesId || seen.has(seriesId)) continue;
    seen.add(seriesId);
    out.push(seriesId);
  }
  return out;
}

function readValues(snapshot: SeriesSnapshot | undefined): number[] {
  if (!snapshot) return [];
  return snapshot.observations
    .map((row) => Number(row.value))
    .filter((row) => Number.isFinite(row));
}

function pctChange(values: number[], window: number): number | null {
  const latestIndex = values.length - 1;
  const baseIndex = latestIndex - window;
  if (latestIndex < 0 || baseIndex < 0) return null;
  const latest = values[latestIndex] ?? Number.NaN;
  const base = values[baseIndex] ?? Number.NaN;
  if (!Number.isFinite(latest) || !Number.isFinite(base) || base === 0) return null;
  return ((latest - base) / Math.abs(base)) * 100;
}

function zscore(values: number[], window: number): number | null {
  const start = Math.max(0, values.length - window);
  const sample = values.slice(start);
  if (sample.length < 3) return null;

  const mean = sample.reduce((acc, row) => acc + row, 0) / sample.length;
  const variance = sample.reduce((acc, row) => {
    const diff = row - mean;
    return acc + diff * diff;
  }, 0) / sample.length;
  const stddev = Math.sqrt(variance);
  if (!Number.isFinite(stddev) || stddev <= 0) return null;

  const latest = sample[sample.length - 1] ?? Number.NaN;
  if (!Number.isFinite(latest)) return null;
  return (latest - mean) / stddev;
}

function compare(value: number, comparator: ParsedRule["comparator"], threshold: number): boolean {
  if (comparator === ">") return value > threshold;
  if (comparator === ">=") return value >= threshold;
  if (comparator === "<") return value < threshold;
  if (comparator === "<=") return value <= threshold;
  return value === threshold;
}

export function evaluateTriggerRule(input: {
  rule: ScenarioTriggerRule;
  snapshotsBySeriesId: Map<string, SeriesSnapshot>;
}): ScenarioTriggerEval {
  const label = normalizeTriggerLabel(asString(input.rule.label) || "트리거");
  const expression = asString(input.rule.expression);
  const parsed = parseRule(expression);
  if (!parsed) {
    return {
      label,
      expression,
      status: "unknown",
      summary: `${label}: 규칙 해석 실패`,
    };
  }

  const snapshot = input.snapshotsBySeriesId.get(parsed.seriesId);
  const values = readValues(snapshot);
  const metricValue = parsed.metric === "pctChange"
    ? pctChange(values, parsed.window)
    : zscore(values, parsed.window);

  if (metricValue === null || !Number.isFinite(metricValue)) {
    return {
      label,
      expression,
      status: "unknown",
      summary: `${label}: ${seriesLabel(parsed.seriesId)} 데이터 부족`,
    };
  }

  const met = compare(metricValue, parsed.comparator, parsed.threshold);
  return {
    label,
    expression,
    status: met ? "met" : "not_met",
    summary: `${label}: ${seriesLabel(parsed.seriesId)} ${metricLabel(parsed.metric)} ${formatSigned(metricValue)}${metricUnit(parsed.metric)} (최근 ${parsed.window}구간) ${met ? "충족" : "미충족"}`,
  };
}

export function summarizeTriggerStatus(rows: ScenarioTriggerEval[]): TriggerStatus {
  if (rows.length < 1) return "unknown";
  if (rows.every((row) => row.status === "met")) return "met";
  if (rows.some((row) => row.status === "not_met")) return "not_met";
  return "unknown";
}

export function evaluateScenarioTriggers(input: {
  rules: ScenarioTriggerRule[];
  snapshots: SeriesSnapshot[];
}): {
  status: TriggerStatus;
  summary: string;
  details: ScenarioTriggerEval[];
} {
  const snapshotsBySeriesId = new Map<string, SeriesSnapshot>();
  for (const snapshot of input.snapshots) {
    const seriesId = asString(snapshot.seriesId);
    if (!seriesId) continue;
    snapshotsBySeriesId.set(seriesId, snapshot);
  }

  const details = input.rules.map((rule) => evaluateTriggerRule({
    rule,
    snapshotsBySeriesId,
  }));
  const status = summarizeTriggerStatus(details);
  const summary = details.map((row) => row.summary).join(" | ") || "trigger 데이터 부족";

  return {
    status,
    summary,
    details,
  };
}
