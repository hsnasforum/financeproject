"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import {
  reportHeroActionLinkClassName,
  reportHeroAnchorLinkClassName,
  reportHeroPrimaryActionClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type DigestDay } from "@/lib/planning/v3/news/digest";
import { type NewsScenarioPack } from "@/lib/planning/v3/news/scenarios";

type NewsSettingsClientProps = {
  csrf?: string;
};

type SourceRow = {
  id: string;
  name: string;
  feedUrl: string;
  country: string;
  language: string;
  defaultEnabled: boolean;
  defaultWeight: number;
  overrideEnabled: boolean | null;
  overrideWeight: number | null;
  effectiveEnabled: boolean;
  effectiveWeight: number;
};

type TopicRow = {
  id: string;
  label: string;
  defaultKeywords: string[];
  overrideKeywords: string[] | null;
  effectiveKeywords: string[];
};

type GetSettingsResponse = {
  ok?: boolean;
  data?: {
    updatedAt?: string | null;
    sources?: SourceRow[];
    topics?: TopicRow[];
  } | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type SaveSettingsResponse = {
  ok?: boolean;
  data?: {
    updatedAt?: string | null;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type SourceTransferItem = {
  url: string;
  weight: number;
  enabled: boolean;
};

type SourceIoGetResponse = {
  ok?: boolean;
  data?: {
    items?: SourceTransferItem[];
  } | null;
  error?: { message?: string };
};

type SourceIoPostResponse = {
  ok?: boolean;
  data?: {
    mode?: "dry_run" | "apply";
    preview?: {
      totalInput?: number;
      validRows?: number;
      createCount?: number;
      updateCount?: number;
      duplicateCount?: number;
      issueCount?: number;
    };
    applied?: {
      updatedOverrides?: number;
      customSources?: number;
    } | null;
  } | null;
  error?: { message?: string };
};

type IndicatorSeriesSpec = {
  id: string;
  sourceId: string;
  externalId: string;
  name: string;
  frequency: "D" | "W" | "M" | "Q" | "Y";
  units?: string;
  transform?: "none" | "pct_change" | "diff" | "log";
  notes?: string;
  enabled?: boolean;
};

type IndicatorCategory =
  | "rates"
  | "inflation"
  | "fx"
  | "growth"
  | "labor"
  | "credit"
  | "commodities"
  | "fiscal"
  | "liquidity"
  | "general";

type IndicatorCatalogRow = IndicatorSeriesSpec & {
  annotation: {
    seriesId: string;
    category: IndicatorCategory;
    label: string;
  };
  displayLabel: string;
};

type IndicatorSpecsGetResponse = {
  ok?: boolean;
  data?: {
    specs?: IndicatorSeriesSpec[];
    catalog?: IndicatorCatalogRow[];
  } | null;
  error?: { message?: string };
};

type IndicatorSpecsPostResponse = {
  ok?: boolean;
  data?: {
    mode?: "dry_run" | "apply";
    preview?: {
      totalInput?: number;
      validRows?: number;
      createCount?: number;
      updateCount?: number;
      duplicateCount?: number;
      issueCount?: number;
    };
    applied?: {
      overridesCount?: number;
      effectiveCount?: number;
    } | null;
  } | null;
  error?: { message?: string };
};

type AlertRuleLevel = "high" | "medium" | "low";
type AlertRuleKind = "topic_burst" | "indicator";
type AlertRuleMetric = "pctChange" | "zscore" | "regime";
type AlertRuleCondition = "up" | "down" | "high" | "low" | "flat" | "unknown";
type AlertRuleTargetType = "topic" | "item" | "scenario" | "series";

type AlertRuleOverride = {
  id: string;
  enabled?: boolean;
  level?: AlertRuleLevel;
  topicId?: string;
  minBurstLevel?: "중" | "상";
  minTodayCount?: number;
  seriesId?: string;
  metric?: AlertRuleMetric;
  window?: number;
  condition?: AlertRuleCondition;
  threshold?: number;
  targetType?: AlertRuleTargetType;
  targetId?: string;
};

type AlertRuleRow = AlertRuleOverride & {
  name?: string;
  kind?: AlertRuleKind;
};

type AlertRulesResponseData = {
  updatedAt?: string | null;
  defaults?: {
    rules?: AlertRuleRow[];
  };
  overrides?: {
    updatedAt?: string | null;
    rules?: AlertRuleOverride[];
  };
  effective?: AlertRuleRow[];
};

type AlertRulesGetResponse = {
  ok?: boolean;
  data?: AlertRulesResponseData | null;
  error?: { message?: string };
};

type AlertRulesPostResponse = {
  ok?: boolean;
  data?: AlertRulesResponseData | null;
  error?: { message?: string };
};

type DigestResponse = {
  ok?: boolean;
  data?: DigestDay | null;
  error?: { message?: string };
};

type ScenarioResponse = {
  ok?: boolean;
  data?: NewsScenarioPack | null;
  error?: { message?: string };
};

type AlertRuleTargetCandidate = {
  id: string;
  label: string;
  detail?: string;
};

const ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME = "rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50";

type ExposureProfile = {
  savedAt?: string;
  debt?: {
    hasDebt?: "yes" | "no" | "unknown";
    rateType?: "fixed" | "variable" | "mixed" | "none" | "unknown";
    repricingHorizon?: "short" | "medium" | "long" | "none" | "unknown";
  };
  inflation?: {
    essentialExpenseShare?: "low" | "medium" | "high" | "unknown";
    rentOrMortgageShare?: "low" | "medium" | "high" | "unknown";
    energyShare?: "low" | "medium" | "high" | "unknown";
  };
  fx?: {
    foreignConsumption?: "low" | "medium" | "high" | "unknown";
    foreignIncome?: "low" | "medium" | "high" | "unknown";
  };
  income?: {
    incomeStability?: "stable" | "moderate" | "fragile" | "unknown";
  };
  liquidity?: {
    monthsOfCashBuffer?: "low" | "medium" | "high" | "unknown";
  };
};

type ExposureResponse = {
  ok?: boolean;
  profile?: ExposureProfile | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type ExposureDraft = {
  hasDebt: "unknown" | "yes" | "no";
  rateType: "fixed" | "variable" | "mixed" | "none" | "unknown";
  repricingHorizon: "short" | "medium" | "long" | "none" | "unknown";
  essentialExpenseShare: "low" | "medium" | "high" | "unknown";
  rentOrMortgageShare: "low" | "medium" | "high" | "unknown";
  energyShare: "low" | "medium" | "high" | "unknown";
  foreignConsumption: "low" | "medium" | "high" | "unknown";
  foreignIncome: "low" | "medium" | "high" | "unknown";
  incomeStability: "stable" | "moderate" | "fragile" | "unknown";
  monthsOfCashBuffer: "low" | "medium" | "high" | "unknown";
};

type SourceDraft = {
  id: string;
  enabled: boolean;
  weight: string;
};

type TopicDraft = {
  id: string;
  keywordsText: string;
};

function buildSourceDrafts(rows: SourceRow[]): Record<string, SourceDraft> {
  return Object.fromEntries(rows.map((row) => [
    row.id,
    {
      id: row.id,
      enabled: row.overrideEnabled ?? row.defaultEnabled,
      weight: String(row.overrideWeight ?? row.defaultWeight),
    },
  ]));
}

function buildTopicDrafts(rows: TopicRow[]): Record<string, TopicDraft> {
  return Object.fromEntries(rows.map((row) => [
    row.id,
    {
      id: row.id,
      keywordsText: keywordsToTextarea(row.overrideKeywords),
    },
  ]));
}

function normalizeWeightInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? String(parsed) : trimmed;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string | null | undefined): string {
  const parsed = Date.parse(asString(value));
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatIndicatorCategory(value: IndicatorCategory | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  const map: Record<string, string> = {
    rates: "금리",
    inflation: "물가",
    fx: "환율",
    growth: "성장",
    labor: "고용",
    credit: "신용",
    commodities: "원자재",
    fiscal: "재정",
    liquidity: "유동성",
    general: "일반",
  };
  return map[normalized] ?? "일반";
}

function formatAlertRuleKind(value: AlertRuleKind | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "topic_burst") return "토픽 급증";
  if (normalized === "indicator") return "지표 변화";
  return "-";
}

function formatAlertRuleMetric(value: AlertRuleMetric | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "pctchange") return "변화율";
  if (normalized === "zscore") return "표준점수";
  if (normalized === "regime") return "추세";
  return "-";
}

function formatAlertRuleCondition(value: AlertRuleCondition | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "up") return "상승";
  if (normalized === "down") return "하락";
  if (normalized === "high") return "고점권";
  if (normalized === "low") return "저점권";
  if (normalized === "flat") return "횡보";
  if (normalized === "unknown") return "데이터 부족";
  return "-";
}

function formatAlertRuleLevel(value: AlertRuleLevel | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high") return "높음";
  if (normalized === "medium") return "중간";
  if (normalized === "low") return "낮음";
  return "-";
}

function formatAlertRuleTargetType(value: AlertRuleTargetType | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "topic") return "토픽";
  if (normalized === "item") return "기사";
  if (normalized === "scenario") return "시나리오";
  if (normalized === "series") return "지표";
  return "-";
}

function dedupeAlertRuleTargetCandidates(rows: AlertRuleTargetCandidate[]): AlertRuleTargetCandidate[] {
  const seen = new Set<string>();
  const out: AlertRuleTargetCandidate[] = [];
  for (const row of rows) {
    const id = asString(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: asString(row.label) || id,
      detail: asString(row.detail) || undefined,
    });
  }
  return out;
}

export function buildAlertRuleItemTargetCandidates(input: {
  topItems?: Array<{
    title?: string;
    url?: string;
    topicLabel?: string;
    sourceName?: string;
  }>;
} | null | undefined): AlertRuleTargetCandidate[] {
  return dedupeAlertRuleTargetCandidates((input?.topItems ?? []).map((row) => ({
    id: asString(row.url),
    label: asString(row.title) || asString(row.url),
    detail: [asString(row.topicLabel), asString(row.sourceName)].filter(Boolean).join(" · "),
  })));
}

export function buildAlertRuleScenarioTargetCandidates(input: {
  scenarios?: Array<{
    name?: string;
    linkedTopics?: string[];
    triggerSummary?: string;
    observation?: string;
  }>;
} | null | undefined): AlertRuleTargetCandidate[] {
  return dedupeAlertRuleTargetCandidates((input?.scenarios ?? []).map((row) => {
    const name = asString(row.name);
    const linkedTopics = (row.linkedTopics ?? []).map((value) => asString(value)).filter(Boolean);
    return {
      id: name,
      label: linkedTopics.length > 0 ? `${name} · ${linkedTopics.join(", ")}` : name,
      detail: asString(row.triggerSummary) || asString(row.observation),
    };
  }));
}

function sortAlertRules(rows: AlertRuleRow[]): AlertRuleRow[] {
  return [...rows].sort((a, b) => {
    const kind = formatAlertRuleKind(a.kind).localeCompare(formatAlertRuleKind(b.kind));
    if (kind !== 0) return kind;
    const name = asString(a.name).localeCompare(asString(b.name));
    if (name !== 0) return name;
    return asString(a.id).localeCompare(asString(b.id));
  });
}

function formatAlertRuleSummary(rule: AlertRuleRow): string {
  const level = formatAlertRuleLevel(rule.level);
  if (rule.kind === "topic_burst") {
    const topic = asString(rule.topicId) || "전체 토픽";
    const minTodayCount = Number.isFinite(rule.minTodayCount) ? Number(rule.minTodayCount) : 0;
    const minBurstLevel = asString(rule.minBurstLevel) || "-";
    return `${level} · ${topic} · 당일 ${minTodayCount}건 이상 · 급증 ${minBurstLevel} 이상`;
  }

  if (rule.kind === "indicator") {
    const seriesId = asString(rule.seriesId) || "-";
    const metric = formatAlertRuleMetric(rule.metric);
    const condition = formatAlertRuleCondition(rule.condition);
    const window = Number.isFinite(rule.window) ? `${Number(rule.window)}기간` : "-";
    const threshold = Number.isFinite(rule.threshold) ? ` · 기준 ${Number(rule.threshold)}` : "";
    const targetType = formatAlertRuleTargetType(rule.targetType);
    const targetId = asString(rule.targetId);
    const target = targetId ? ` · 연결 ${targetType}:${targetId}` : "";
    return `${level} · ${seriesId} · ${metric} · ${condition} · ${window}${threshold}${target}`;
  }

  return "-";
}

function normalizeAlertRuleOverride(value: unknown): AlertRuleOverride | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = asString(source.id);
  if (!id) return null;

  const normalized: AlertRuleOverride = { id };
  if (typeof source.enabled === "boolean") normalized.enabled = source.enabled;

  const level = asString(source.level);
  if (level === "high" || level === "medium" || level === "low") normalized.level = level;

  const topicId = asString(source.topicId);
  if (topicId) normalized.topicId = topicId;

  const minBurstLevel = asString(source.minBurstLevel);
  if (minBurstLevel === "중" || minBurstLevel === "상") normalized.minBurstLevel = minBurstLevel;

  const minTodayCount = Number(source.minTodayCount);
  if (Number.isInteger(minTodayCount) && minTodayCount >= 0) normalized.minTodayCount = minTodayCount;

  const seriesId = asString(source.seriesId);
  if (seriesId) normalized.seriesId = seriesId;

  const metric = asString(source.metric);
  if (metric === "pctChange" || metric === "zscore" || metric === "regime") normalized.metric = metric;

  const window = Number(source.window);
  if (Number.isInteger(window) && window > 0 && window <= 365) normalized.window = window;

  const condition = asString(source.condition);
  if (
    condition === "up"
    || condition === "down"
    || condition === "high"
    || condition === "low"
    || condition === "flat"
    || condition === "unknown"
  ) {
    normalized.condition = condition;
  }

  const threshold = Number(source.threshold);
  if (Number.isFinite(threshold)) normalized.threshold = threshold;

  const targetType = asString(source.targetType);
  if (targetType === "topic" || targetType === "item" || targetType === "scenario" || targetType === "series") {
    normalized.targetType = targetType;
  }

  const targetId = asString(source.targetId);
  if (targetId) normalized.targetId = targetId;

  return normalized;
}

export function parseAlertRuleOverridesJson(value: string): { rules: AlertRuleOverride[]; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { rules: [], error: "" };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return { rules: [], error: "알림 규칙 오버라이드는 JSON 배열이어야 합니다." };
    }
    return {
      rules: parsed.map((row) => normalizeAlertRuleOverride(row)).filter((row): row is AlertRuleOverride => !!row),
      error: "",
    };
  } catch {
    return { rules: [], error: "알림 규칙 오버라이드 JSON 형식이 올바르지 않습니다." };
  }
}

export function buildAlertRuleDraftEffective(defaults: AlertRuleRow[], overrides: AlertRuleOverride[]): AlertRuleRow[] {
  const overrideById = new Map(overrides.map((row) => [row.id, row]));
  return defaults.map((rule) => ({
    ...rule,
    ...(overrideById.get(rule.id) ?? {}),
    id: rule.id,
    kind: rule.kind,
    name: rule.name,
  }));
}

function hasMeaningfulAlertRuleOverride(rule: AlertRuleOverride): boolean {
  return Object.keys(rule).some((key) => key !== "id");
}

function alertRuleOverrideValueEquals(left: unknown, right: unknown): boolean {
  if (typeof left === "number" || typeof right === "number") {
    if (!Number.isFinite(Number(left)) || !Number.isFinite(Number(right))) return false;
    return Number(left) === Number(right);
  }
  return left === right;
}

export function setAlertRuleOverrideFields(
  overrides: AlertRuleOverride[],
  defaultRule: AlertRuleRow,
  patch: Partial<AlertRuleOverride>,
): AlertRuleOverride[] {
  const next = [...overrides];
  const index = next.findIndex((row) => row.id === defaultRule.id);
  const current = index >= 0 ? { ...next[index] } : { id: defaultRule.id };
  const currentRecord = current as Record<string, unknown>;
  const defaultRecord = defaultRule as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (key === "id") continue;
    if (typeof value === "undefined" || alertRuleOverrideValueEquals(value, defaultRecord[key])) {
      delete currentRecord[key];
      continue;
    }
    currentRecord[key] = value;
  }

  if (!hasMeaningfulAlertRuleOverride(current)) {
    if (index >= 0) next.splice(index, 1);
    return next;
  }

  if (index >= 0) next[index] = current;
  else next.push(current);
  return next.sort((a, b) => a.id.localeCompare(b.id));
}

export function setAlertRuleEnabledOverride(
  overrides: AlertRuleOverride[],
  defaultRule: AlertRuleRow,
  nextEnabled: boolean,
): AlertRuleOverride[] {
  return setAlertRuleOverrideFields(overrides, defaultRule, { enabled: nextEnabled });
}

export function clearAlertRuleOverride(overrides: AlertRuleOverride[], ruleId: string): AlertRuleOverride[] {
  return overrides.filter((row) => row.id !== ruleId);
}

export function shouldOpenAlertRulesPanel(ruleCount: number, loadError: string): boolean {
  return ruleCount > 0 || asString(loadError).length > 0;
}

export function hasAlertRulesDraftChanges(currentJson: string, initialJson: string): boolean {
  const currentParsed = parseAlertRuleOverridesJson(currentJson);
  const initialParsed = parseAlertRuleOverridesJson(initialJson);
  const normalizedCurrent = currentParsed.error ? currentJson.trim() : JSON.stringify(currentParsed.rules);
  const normalizedInitial = initialParsed.error ? initialJson.trim() : JSON.stringify(initialParsed.rules);
  return normalizedCurrent !== normalizedInitial;
}

export function canSaveNewsSettings(settingsDirty: boolean, alertRulesDirty: boolean): boolean {
  return settingsDirty && !alertRulesDirty;
}

export function getNewsSettingsSaveStatus(
  settingsDirty: boolean,
  alertRulesDirty: boolean,
  alertRulesStateKnown = true,
): string {
  if (settingsDirty && alertRulesDirty) return "알림 규칙 미적용 변경이 있어 뉴스 기준/내 상황 저장을 잠시 막았습니다.";
  if (settingsDirty) return "뉴스 기준 또는 내 상황 프로필에 저장 전 변경이 있습니다.";
  if (alertRulesDirty) return "알림 규칙은 아직 적용 전이며 메인 저장에는 포함되지 않습니다.";
  if (!alertRulesStateKnown) return "뉴스 기준과 내 상황 프로필은 현재 저장 전 변경이 없고, 알림 규칙 적용 상태는 다시 확인이 필요합니다.";
  return "뉴스 기준 저장 대상과 알림 규칙 적용 상태가 현재 화면과 같습니다.";
}

export function getNewsSettingsSaveDetail(
  settingsDirty: boolean,
  alertRulesDirty: boolean,
  alertRulesStateKnown = true,
): string {
  if (settingsDirty && alertRulesDirty) {
    return "메인 저장은 뉴스 기준과 내 상황 프로필만 처리합니다. 알림 규칙은 아래 섹션에서 먼저 적용해 주세요.";
  }
  if (settingsDirty) {
    return "이 버튼은 뉴스 기준과 내 상황 프로필만 저장합니다. 알림 규칙 적용 여부는 아래 섹션에서 따로 관리됩니다.";
  }
  if (alertRulesDirty) {
    return "알림 규칙은 이 섹션의 적용 버튼으로만 반영되며, 메인 저장에는 포함되지 않습니다.";
  }
  if (!alertRulesStateKnown) {
    return "뉴스 기준과 내 상황 프로필은 현재 저장 전 변경이 없습니다. 알림 규칙 적용 상태는 다시 불러와 확인해 주세요.";
  }
  return "메인 저장과 알림 규칙 적용은 서로 별개로 유지됩니다.";
}

export function getAlertRulesApplyStatus(alertRulesDirty: boolean, alertRulesStateKnown = true): string {
  if (!alertRulesStateKnown) return "알림 규칙 현재 적용 상태를 아직 확인하지 못했습니다. 다시 불러온 뒤 적용 여부를 확인하세요.";
  if (alertRulesDirty) return "알림 규칙에 적용 전 변경이 있습니다. 적용 전까지는 마지막 적용 기준이 계속 사용됩니다.";
  return "알림 규칙은 이 섹션에서만 적용되며, 메인 저장과 별개입니다.";
}

export function getAlertRulesSectionStatus(
  alertRulesDirty: boolean,
  phase: "idle" | "reloading" | "applying",
  alertRulesStateKnown = true,
): string {
  if (phase === "reloading") return "알림 규칙 현재 적용값을 불러오는 중입니다.";
  if (phase === "applying") return "알림 규칙을 적용 중입니다.";
  return getAlertRulesApplyStatus(alertRulesDirty, alertRulesStateKnown);
}

const ALERT_RULE_SCENARIO_TARGET_IDS = ["Base", "Bull", "Bear"] as const;

export function getAlertRuleTargetIdSuggestions(
  targetType: AlertRuleTargetType | string | undefined,
  topics: TopicRow[],
  indicatorCatalog: IndicatorCatalogRow[],
  options?: {
    scenarioCandidates?: AlertRuleTargetCandidate[];
    itemCandidates?: AlertRuleTargetCandidate[];
  },
): string[] {
  const normalized = asString(targetType).toLowerCase();
  if (normalized === "topic") {
    return topics.map((row) => row.id).filter((value, index, all) => value && all.indexOf(value) === index);
  }
  if (normalized === "series") {
    return indicatorCatalog.map((row) => row.id).filter((value, index, all) => value && all.indexOf(value) === index);
  }
  if (normalized === "item") {
    return (options?.itemCandidates ?? []).map((row) => row.id).filter((value, index, all) => value && all.indexOf(value) === index);
  }
  if (normalized === "scenario") {
    const scenarioIds = (options?.scenarioCandidates ?? []).map((row) => row.id).filter((value, index, all) => value && all.indexOf(value) === index);
    if (scenarioIds.length > 0) return scenarioIds;
    return [...ALERT_RULE_SCENARIO_TARGET_IDS];
  }
  return [];
}

export function getAlertRuleTargetPickerHint(
  targetType: AlertRuleTargetType | string | undefined,
  candidateCount: number,
): string {
  const normalized = asString(targetType).toLowerCase();
  if (normalized === "item") {
    if (candidateCount > 0) return `최근 기사 후보 ${candidateCount}개를 바로 고른 뒤 적용하면 Digest에서 결과를 확인할 수 있습니다.`;
    return "최근 digest Top Links 캐시가 없어 기사 URL을 직접 입력해야 합니다. 적용 뒤 Digest에서 결과를 확인하세요.";
  }
  if (normalized === "scenario") {
    if (candidateCount > 0) return `현재 시나리오 후보 ${candidateCount}개를 바로 고른 뒤 적용하면 알림함이나 Digest에서 결과를 확인할 수 있습니다.`;
    return "현재 시나리오 캐시가 없어 이름을 직접 입력해야 합니다. 적용 뒤 알림함이나 Digest에서 결과를 확인하세요.";
  }
  return "";
}

function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n|,/g)) {
    const token = raw.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function keywordsToTextarea(value: string[] | null | undefined): string {
  if (!Array.isArray(value) || value.length < 1) return "";
  return value.join("\n");
}

function emptyExposureDraft(): ExposureDraft {
  return {
    hasDebt: "unknown",
    rateType: "unknown",
    repricingHorizon: "unknown",
    essentialExpenseShare: "unknown",
    rentOrMortgageShare: "unknown",
    energyShare: "unknown",
    foreignConsumption: "unknown",
    foreignIncome: "unknown",
    incomeStability: "unknown",
    monthsOfCashBuffer: "unknown",
  };
}

function profileToDraft(profile: ExposureProfile | null | undefined): ExposureDraft {
  if (!profile) return emptyExposureDraft();
  return {
    hasDebt: profile.debt?.hasDebt ?? "unknown",
    rateType: profile.debt?.rateType ?? "unknown",
    repricingHorizon: profile.debt?.repricingHorizon ?? "unknown",
    essentialExpenseShare: profile.inflation?.essentialExpenseShare ?? "unknown",
    rentOrMortgageShare: profile.inflation?.rentOrMortgageShare ?? "unknown",
    energyShare: profile.inflation?.energyShare ?? "unknown",
    foreignConsumption: profile.fx?.foreignConsumption ?? "unknown",
    foreignIncome: profile.fx?.foreignIncome ?? "unknown",
    incomeStability: profile.income?.incomeStability ?? "unknown",
    monthsOfCashBuffer: profile.liquidity?.monthsOfCashBuffer ?? "unknown",
  };
}

function draftToProfile(draft: ExposureDraft): Omit<ExposureProfile, "savedAt"> {
  return {
    debt: {
      hasDebt: draft.hasDebt,
      rateType: draft.rateType,
      repricingHorizon: draft.repricingHorizon,
    },
    inflation: {
      essentialExpenseShare: draft.essentialExpenseShare,
      rentOrMortgageShare: draft.rentOrMortgageShare,
      energyShare: draft.energyShare,
    },
    fx: {
      foreignConsumption: draft.foreignConsumption,
      foreignIncome: draft.foreignIncome,
    },
    income: {
      incomeStability: draft.incomeStability,
    },
    liquidity: {
      monthsOfCashBuffer: draft.monthsOfCashBuffer,
    },
  };
}

function countKnownExposureFields(draft: ExposureDraft): number {
  return Object.values(draft).filter((value) => value !== "unknown").length;
}

export function NewsSettingsClient({ csrf }: NewsSettingsClientProps) {
  const [loading, setLoading] = useState(true);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [exposureUpdatedAt, setExposureUpdatedAt] = useState<string | null>(null);
  const [alertRulesUpdatedAt, setAlertRulesUpdatedAt] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, SourceDraft>>({});
  const [initialSourceDrafts, setInitialSourceDrafts] = useState<Record<string, SourceDraft>>({});
  const [topicDrafts, setTopicDrafts] = useState<Record<string, TopicDraft>>({});
  const [initialTopicDrafts, setInitialTopicDrafts] = useState<Record<string, TopicDraft>>({});
  const [exposureDraft, setExposureDraft] = useState<ExposureDraft>(emptyExposureDraft());
  const [initialExposureDraft, setInitialExposureDraft] = useState<ExposureDraft>(emptyExposureDraft());
  const [sourcesJson, setSourcesJson] = useState("[]");
  const [sourcesIoLoading, setSourcesIoLoading] = useState(false);
  const [sourcesIoSummary, setSourcesIoSummary] = useState("");
  const [specsJson, setSpecsJson] = useState("[]");
  const [specsIoLoading, setSpecsIoLoading] = useState(false);
  const [specsIoSummary, setSpecsIoSummary] = useState("");
  const [indicatorCatalog, setIndicatorCatalog] = useState<IndicatorCatalogRow[]>([]);
  const [alertRuleDefaults, setAlertRuleDefaults] = useState<AlertRuleRow[]>([]);
  const [alertRulesJson, setAlertRulesJson] = useState("[]\n");
  const [initialAlertRulesJson, setInitialAlertRulesJson] = useState("[]\n");
  const [alertRulesPhase, setAlertRulesPhase] = useState<"idle" | "reloading" | "applying">("idle");
  const [alertRulesIoSummary, setAlertRulesIoSummary] = useState("");
  const [alertRulesLoadError, setAlertRulesLoadError] = useState("");
  const [digestTargetSource, setDigestTargetSource] = useState<DigestDay | null>(null);
  const [scenarioTargetSource, setScenarioTargetSource] = useState<NewsScenarioPack | null>(null);

  const applyIndicatorSpecsResponse = useCallback((payload: IndicatorSpecsGetResponse | null | undefined) => {
    const specs = payload?.data?.specs ?? [];
    const catalog = payload?.data?.catalog ?? [];
    setSpecsJson(`${JSON.stringify(specs, null, 2)}\n`);
    setIndicatorCatalog([...catalog].sort((a, b) => asString(a.id).localeCompare(asString(b.id))));
  }, []);

  const applyAlertRulesResponse = useCallback((payload: AlertRulesGetResponse | AlertRulesPostResponse | null | undefined) => {
    const defaults = payload?.data?.defaults?.rules ?? null;
    const overrides = payload?.data?.overrides?.rules ?? [];
    setAlertRulesUpdatedAt(payload?.data?.updatedAt ?? payload?.data?.overrides?.updatedAt ?? null);
    if (Array.isArray(defaults)) {
      setAlertRuleDefaults(sortAlertRules(defaults));
    }
    const nextJson = `${JSON.stringify(overrides, null, 2)}\n`;
    setAlertRulesJson(nextJson);
    setInitialAlertRulesJson(nextJson);
    setAlertRulesLoadError("");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setInitialLoadFailed(false);
    setErrorMessage("");
    setAlertRulesLoadError("");
    try {
      const [settingsResponse, exposureResponse] = await Promise.all([
        fetch("/api/planning/v3/news/settings", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }),
        fetch("/api/planning/v3/exposure/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }),
      ]);
      const [specsResponse, alertRulesResponse, digestResponse, scenarioResponse] = await Promise.all([
        fetch("/api/planning/v3/indicators/specs", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }).catch(() => null),
        fetch("/api/planning/v3/news/alerts/rules", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }).catch(() => null),
        fetch("/api/planning/v3/news/digest", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }).catch(() => null),
        fetch("/api/planning/v3/news/scenarios", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }).catch(() => null),
      ]);
      const settingsPayload = (await settingsResponse.json().catch(() => null)) as GetSettingsResponse | null;
      const exposurePayload = (await exposureResponse.json().catch(() => null)) as ExposureResponse | null;
      const specsPayload = specsResponse
        ? (await specsResponse.json().catch(() => null)) as IndicatorSpecsGetResponse | null
        : null;
      const alertRulesPayload = alertRulesResponse
        ? (await alertRulesResponse.json().catch(() => null)) as AlertRulesGetResponse | null
        : null;
      const digestPayload = digestResponse
        ? (await digestResponse.json().catch(() => null)) as DigestResponse | null
        : null;
      const scenarioPayload = scenarioResponse
        ? (await scenarioResponse.json().catch(() => null)) as ScenarioResponse | null
        : null;
      if (!settingsResponse.ok || settingsPayload?.ok !== true || !settingsPayload.data) {
        throw new Error(settingsPayload?.error?.message ?? `HTTP ${settingsResponse.status}`);
      }
      if (!exposureResponse.ok || exposurePayload?.ok !== true) {
        throw new Error(exposurePayload?.error?.message ?? `HTTP ${exposureResponse.status}`);
      }
      if (specsResponse?.ok && specsPayload?.ok === true) {
        applyIndicatorSpecsResponse(specsPayload);
      } else {
        setSpecsJson("[]\n");
        setIndicatorCatalog([]);
      }
      if (alertRulesResponse?.ok && alertRulesPayload?.ok === true) {
        applyAlertRulesResponse(alertRulesPayload);
      } else {
        setAlertRuleDefaults([]);
        setAlertRulesJson("[]\n");
        setInitialAlertRulesJson("[]\n");
        setAlertRulesUpdatedAt(null);
        if (alertRulesResponse) {
          setAlertRulesLoadError(alertRulesPayload?.error?.message ?? `알림 규칙을 불러오지 못했습니다. HTTP ${alertRulesResponse.status}`);
        } else {
          setAlertRulesLoadError("알림 규칙을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      }
      setDigestTargetSource(digestResponse?.ok && digestPayload?.ok === true ? (digestPayload.data ?? null) : null);
      setScenarioTargetSource(scenarioResponse?.ok && scenarioPayload?.ok === true ? (scenarioPayload.data ?? null) : null);

      const loadedSources = settingsPayload.data.sources ?? [];
      const loadedTopics = settingsPayload.data.topics ?? [];
      const nextSourceDrafts = buildSourceDrafts(loadedSources);
      const nextTopicDrafts = buildTopicDrafts(loadedTopics);
      const nextExposureDraft = profileToDraft(exposurePayload.profile ?? null);
      setUpdatedAt(settingsPayload.data.updatedAt ?? null);
      setSources(loadedSources);
      setTopics(loadedTopics);
      setExposureUpdatedAt(exposurePayload.profile?.savedAt ?? null);
      setExposureDraft(nextExposureDraft);
      setInitialExposureDraft(nextExposureDraft);
      setSourceDrafts(nextSourceDrafts);
      setInitialSourceDrafts(nextSourceDrafts);
      setTopicDrafts(nextTopicDrafts);
      setInitialTopicDrafts(nextTopicDrafts);
    } catch (error) {
      setInitialLoadFailed(true);
      setErrorMessage(error instanceof Error ? error.message : "설정을 불러오지 못했습니다.");
      setSources([]);
      setTopics([]);
      setSourceDrafts({});
      setInitialSourceDrafts({});
      setTopicDrafts({});
      setInitialTopicDrafts({});
      setExposureDraft(emptyExposureDraft());
      setInitialExposureDraft(emptyExposureDraft());
      setIndicatorCatalog([]);
      setSpecsJson("[]\n");
      setAlertRuleDefaults([]);
      setAlertRulesJson("[]\n");
      setInitialAlertRulesJson("[]\n");
      setAlertRulesLoadError("설정을 불러오지 못해 알림 규칙 적용 상태를 확인하지 못했습니다.");
      setAlertRulesUpdatedAt(null);
      setDigestTargetSource(null);
      setScenarioTargetSource(null);
    } finally {
      setLoading(false);
    }
  }, [applyAlertRulesResponse, applyIndicatorSpecsResponse]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsedAlertRulesDraft = useMemo(() => parseAlertRuleOverridesJson(alertRulesJson), [alertRulesJson]);
  const alertRuleOverridesCount = parsedAlertRulesDraft.rules.length;
  const alertRuleDraftEffective = useMemo(
    () => sortAlertRules(buildAlertRuleDraftEffective(alertRuleDefaults, parsedAlertRulesDraft.rules)),
    [alertRuleDefaults, parsedAlertRulesDraft.rules],
  );
  const alertRuleDefaultsById = useMemo(
    () => new Map(alertRuleDefaults.map((row) => [row.id, row])),
    [alertRuleDefaults],
  );
  const enabledAlertRuleCount = useMemo(
    () => alertRuleDraftEffective.filter((row) => row.enabled !== false).length,
    [alertRuleDraftEffective],
  );
  const alertRuleItemCandidates = useMemo(
    () => buildAlertRuleItemTargetCandidates(digestTargetSource),
    [digestTargetSource],
  );
  const alertRuleScenarioCandidates = useMemo(
    () => buildAlertRuleScenarioTargetCandidates(scenarioTargetSource),
    [scenarioTargetSource],
  );

  const settingsDirty = useMemo(() => {
    for (const row of sources) {
      const draft = sourceDrafts[row.id] ?? { id: row.id, enabled: row.defaultEnabled, weight: String(row.defaultWeight) };
      const initial = initialSourceDrafts[row.id] ?? draft;
      const enabledChanged = draft.enabled !== initial.enabled;
      const weightChanged = normalizeWeightInput(draft.weight) !== normalizeWeightInput(initial.weight);
      if (enabledChanged || weightChanged) return true;
    }
    for (const row of topics) {
      const draft = topicDrafts[row.id] ?? { id: row.id, keywordsText: "" };
      const initial = initialTopicDrafts[row.id] ?? draft;
      const parsed = parseKeywords(draft.keywordsText);
      const initialParsed = parseKeywords(initial.keywordsText);
      const equal = parsed.length === initialParsed.length && parsed.every((token, idx) => token === initialParsed[idx]);
      if (!equal) return true;
    }
    if (JSON.stringify(exposureDraft) !== JSON.stringify(initialExposureDraft)) return true;
    return false;
  }, [
    exposureDraft,
    initialExposureDraft,
    initialSourceDrafts,
    initialTopicDrafts,
    sourceDrafts,
    sources,
    topicDrafts,
    topics,
  ]);
  const alertRulesDirty = useMemo(
    () => hasAlertRulesDraftChanges(alertRulesJson, initialAlertRulesJson),
    [alertRulesJson, initialAlertRulesJson],
  );
  const canSaveSettings = useMemo(
    () => canSaveNewsSettings(settingsDirty, alertRulesDirty),
    [alertRulesDirty, settingsDirty],
  );
  const alertRulesStateKnown = !loading && !initialLoadFailed && !alertRulesLoadError;
  const newsSettingsStatusText = loading
    ? "뉴스 기준과 내 상황 프로필 설정을 불러오는 중입니다."
    : initialLoadFailed
      ? "뉴스 기준과 내 상황 프로필 설정을 아직 확인하지 못했습니다. 다시 불러온 뒤 저장 상태를 확인하세요."
      : getNewsSettingsSaveStatus(settingsDirty, alertRulesDirty, alertRulesStateKnown);
  const newsSettingsDetailText = loading
    ? "불러오기가 끝나면 메인 저장 대상과 알림 규칙 적용 상태를 함께 확인할 수 있습니다."
    : initialLoadFailed
      ? "설정과 알림 규칙 적용 상태가 확인되지 않아 저장/적용 완료처럼 안내하지 않습니다. 페이지를 다시 불러온 뒤 확인해 주세요."
      : getNewsSettingsSaveDetail(settingsDirty, alertRulesDirty, alertRulesStateKnown);
  const alertRulesSectionStatusText = loading
    ? "알림 규칙 현재 적용 상태를 불러오는 중입니다."
    : initialLoadFailed
      ? "알림 규칙 현재 적용 상태를 아직 확인하지 못했습니다. 설정을 다시 불러온 뒤 적용 여부를 확인하세요."
      : getAlertRulesSectionStatus(alertRulesDirty, alertRulesPhase, alertRulesStateKnown);
  const activeSourceCount = useMemo(() => {
    return sources.filter((row) => (sourceDrafts[row.id]?.enabled ?? row.defaultEnabled) === true).length;
  }, [sourceDrafts, sources]);
  const overriddenTopicCount = useMemo(() => {
    return topics.filter((row) => {
      const parsed = parseKeywords(topicDrafts[row.id]?.keywordsText ?? "");
      const defaults = row.defaultKeywords;
      return !(parsed.length === defaults.length && parsed.every((token, index) => token === defaults[index]));
    }).length;
  }, [topicDrafts, topics]);
  const exposureCompletionCount = useMemo(() => countKnownExposureFields(exposureDraft), [exposureDraft]);
  const enabledIndicatorCount = useMemo(() => indicatorCatalog.filter((row) => row.enabled !== false).length, [indicatorCatalog]);

  function updateSourceEnabled(id: string, value: boolean) {
    setSourceDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { id, enabled: value, weight: "1" }),
        enabled: value,
      },
    }));
  }

  function updateSourceWeight(id: string, value: string) {
    setSourceDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { id, enabled: true, weight: value }),
        weight: value,
      },
    }));
  }

  function updateTopicKeywords(id: string, value: string) {
    setTopicDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { id, keywordsText: "" }),
        keywordsText: value,
      },
    }));
  }

  function updateExposure<K extends keyof ExposureDraft>(key: K, value: ExposureDraft[K]) {
    setExposureDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSave() {
    if (!canSaveSettings) {
      if (alertRulesDirty) {
        setErrorMessage("알림 규칙은 메인 저장에 포함되지 않습니다. 이 섹션의 적용 버튼으로 먼저 반영하거나 되돌려 주세요.");
        setNotice("");
      }
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setNotice("");
    let settingsSaved = false;
    let savedSettingsAt: string | null = null;
    try {
      const sourceOverrides = sources.map((row) => {
        const draft = sourceDrafts[row.id];
        const parsedWeight = Number(draft?.weight ?? row.defaultWeight);
        const weight = Number.isFinite(parsedWeight) ? parsedWeight : row.defaultWeight;
        const enabled = draft?.enabled ?? row.defaultEnabled;
        return {
          id: row.id,
          enabled: enabled === row.defaultEnabled ? undefined : enabled,
          weight: Math.abs(weight - row.defaultWeight) <= 1e-9 ? undefined : weight,
        };
      }).filter((row) => typeof row.enabled === "boolean" || typeof row.weight === "number");

      const topicOverrides = topics.map((row) => {
        const parsed = parseKeywords(topicDrafts[row.id]?.keywordsText ?? "");
        const defaults = row.defaultKeywords;
        const equal = parsed.length === defaults.length && parsed.every((token, idx) => token === defaults[idx]);
        return {
          id: row.id,
          keywords: equal ? undefined : parsed,
        };
      }).filter((row) => Array.isArray(row.keywords));

      const payloadWithCsrf = withDevCsrf({
        sources: sourceOverrides,
        topics: topicOverrides,
      });
      if (!payloadWithCsrf.csrf && asString(csrf)) {
        payloadWithCsrf.csrf = asString(csrf);
      }

      const response = await fetch("/api/planning/v3/news/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payloadWithCsrf),
      });
      const result = (await response.json().catch(() => null)) as SaveSettingsResponse | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      settingsSaved = true;
      savedSettingsAt = result.data?.updatedAt ?? null;
      if (savedSettingsAt) setUpdatedAt(savedSettingsAt);

      const exposurePayloadWithCsrf = withDevCsrf({
        profile: draftToProfile(exposureDraft),
      });
      if (!exposurePayloadWithCsrf.csrf && asString(csrf)) {
        exposurePayloadWithCsrf.csrf = asString(csrf);
      }
      const exposureResponse = await fetch("/api/planning/v3/exposure/profile", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(exposurePayloadWithCsrf),
      });
      const exposureResult = (await exposureResponse.json().catch(() => null)) as ExposureResponse | null;
      if (!exposureResponse.ok || exposureResult?.ok !== true) {
        throw new Error(exposureResult?.error?.message ?? `HTTP ${exposureResponse.status}`);
      }
      if (asString(exposureResult.profile?.savedAt)) {
        setExposureUpdatedAt(exposureResult.profile?.savedAt ?? null);
      }

      setNotice("뉴스 기준과 내 상황 프로필을 저장했습니다. 알림 규칙은 별도 적용 상태를 유지합니다.");
      await load();
    } catch (error) {
      if (settingsSaved) {
        setInitialSourceDrafts(sourceDrafts);
        setInitialTopicDrafts(topicDrafts);
        if (savedSettingsAt) setUpdatedAt(savedSettingsAt);
        setNotice("뉴스 기준은 저장했고, 내 상황 프로필은 다시 저장이 필요합니다. 알림 규칙은 별도 적용 상태를 유지합니다.");
      }
      setErrorMessage(error instanceof Error ? error.message : "설정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExportSources() {
    setSourcesIoLoading(true);
    setErrorMessage("");
    setSourcesIoSummary("");
    try {
      const response = await fetch("/api/planning/v3/news/sources", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const result = (await response.json().catch(() => null)) as SourceIoGetResponse | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      const items = result.data?.items ?? [];
      setSourcesJson(`${JSON.stringify(items, null, 2)}\n`);
      setSourcesIoSummary(`내보내기 완료: ${items.length}개 소스`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "소스 내보내기에 실패했습니다.");
    } finally {
      setSourcesIoLoading(false);
    }
  }

  async function handleImportSources(mode: "dry_run" | "apply") {
    setSourcesIoLoading(true);
    setErrorMessage("");
    setSourcesIoSummary("");
    try {
      const parsed = JSON.parse(sourcesJson) as unknown;
      const items = Array.isArray(parsed) ? parsed : [];
      const payload = withDevCsrf({ mode, items });
      if (!payload.csrf && asString(csrf)) payload.csrf = asString(csrf);

      const response = await fetch("/api/planning/v3/news/sources", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as SourceIoPostResponse | null;
      if (!response.ok || result?.ok !== true || !result.data?.preview) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      const preview = result.data.preview;
      setSourcesIoSummary(
        `${mode === "apply" ? "적용" : "Dry-run"}: 입력 ${preview.totalInput ?? 0}, 유효 ${preview.validRows ?? 0}, 신규 ${preview.createCount ?? 0}, 갱신 ${preview.updateCount ?? 0}, 중복 ${preview.duplicateCount ?? 0}, 이슈 ${preview.issueCount ?? 0}`,
      );
      if (mode === "apply") {
        await load();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "소스 import 처리에 실패했습니다.");
    } finally {
      setSourcesIoLoading(false);
    }
  }

  async function handleExportSpecs() {
    setSpecsIoLoading(true);
    setErrorMessage("");
    setSpecsIoSummary("");
    try {
      const response = await fetch("/api/planning/v3/indicators/specs", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const result = (await response.json().catch(() => null)) as IndicatorSpecsGetResponse | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      applyIndicatorSpecsResponse(result);
      const specs = result.data?.specs ?? [];
      setSpecsIoSummary(`내보내기 완료: ${specs.length}개 series spec`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "series spec 내보내기에 실패했습니다.");
    } finally {
      setSpecsIoLoading(false);
    }
  }

  async function handleImportSpecs(mode: "dry_run" | "apply") {
    setSpecsIoLoading(true);
    setErrorMessage("");
    setSpecsIoSummary("");
    try {
      const parsed = JSON.parse(specsJson) as unknown;
      const specs = Array.isArray(parsed) ? parsed : [];
      const payload = withDevCsrf({ mode, specs });
      if (!payload.csrf && asString(csrf)) payload.csrf = asString(csrf);

      const response = await fetch("/api/planning/v3/indicators/specs", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as IndicatorSpecsPostResponse | null;
      if (!response.ok || result?.ok !== true || !result.data?.preview) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      const preview = result.data.preview;
      setSpecsIoSummary(
        `${mode === "apply" ? "적용" : "Dry-run"}: 입력 ${preview.totalInput ?? 0}, 유효 ${preview.validRows ?? 0}, 신규 ${preview.createCount ?? 0}, 갱신 ${preview.updateCount ?? 0}, 중복 ${preview.duplicateCount ?? 0}, 이슈 ${preview.issueCount ?? 0}`,
      );
      if (mode === "apply") {
        await load();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "series spec import 처리에 실패했습니다.");
    } finally {
      setSpecsIoLoading(false);
    }
  }

  async function handleExportAlertRules() {
    if (alertRulesDirty) {
      setErrorMessage("알림 규칙에 미적용 변경이 있습니다. 적용하거나 되돌린 뒤 현재 적용값 불러오기를 실행해 주세요.");
      return;
    }
    setAlertRulesPhase("reloading");
    setErrorMessage("");
    setNotice("");
    setAlertRulesIoSummary("");
    try {
      const response = await fetch("/api/planning/v3/news/alerts/rules", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const result = (await response.json().catch(() => null)) as AlertRulesGetResponse | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      applyAlertRulesResponse(result);
      const overrides = result.data?.overrides?.rules ?? [];
      const effective = result.data?.effective ?? [];
      const enabled = effective.filter((row) => row.enabled !== false).length;
      setAlertRulesIoSummary(`현재 적용값 불러오기 완료: 오버라이드 ${overrides.length}개 · 활성 규칙 ${enabled}/${effective.length}개`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알림 규칙을 불러오지 못했습니다.";
      setErrorMessage(message);
      setAlertRulesLoadError(message);
    } finally {
      setAlertRulesPhase("idle");
    }
  }

  async function handleReloadAlertRules() {
    if (alertRulesDirty) {
      setErrorMessage("알림 규칙에 미적용 변경이 있습니다. 적용하거나 되돌린 뒤 적용값 다시 불러오기를 실행해 주세요.");
      return;
    }
    setAlertRulesPhase("reloading");
    setErrorMessage("");
    setNotice("");
    setAlertRulesIoSummary("");
    try {
      const response = await fetch("/api/planning/v3/news/alerts/rules", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const result = (await response.json().catch(() => null)) as AlertRulesGetResponse | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      applyAlertRulesResponse(result);
      setAlertRulesIoSummary("알림 규칙 현재 적용값을 다시 불러왔습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "알림 규칙을 불러오지 못했습니다.";
      setErrorMessage(message);
      setAlertRulesLoadError(message);
    } finally {
      setAlertRulesPhase("idle");
    }
  }

  async function handleApplyAlertRules() {
    if (alertRulesLoadError) {
      setErrorMessage("알림 규칙을 먼저 다시 불러온 뒤 적용해 주세요.");
      return;
    }
    if (!alertRulesDirty) {
      setErrorMessage("적용할 알림 규칙 변경이 없습니다.");
      return;
    }
    setAlertRulesPhase("applying");
    setErrorMessage("");
    setNotice("");
    setAlertRulesIoSummary("");
    try {
      const parsed = parseAlertRuleOverridesJson(alertRulesJson);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      const payload = withDevCsrf({ rules: parsed.rules });
      if (!payload.csrf && asString(csrf)) payload.csrf = asString(csrf);

      const response = await fetch("/api/planning/v3/news/alerts/rules", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as AlertRulesPostResponse | null;
      if (!response.ok || result?.ok !== true || !result.data) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      applyAlertRulesResponse(result);
      const overrides = result.data.overrides?.rules ?? [];
      const effective = result.data.effective ?? [];
      const enabled = effective.filter((row) => row.enabled !== false).length;
      setAlertRulesIoSummary(`적용 완료: 오버라이드 ${overrides.length}개 · 활성 규칙 ${enabled}/${effective.length}개`);
      setNotice("알림 규칙을 적용했습니다. 이 변경은 메인 저장과 별도로 반영됩니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "알림 규칙 적용에 실패했습니다.");
    } finally {
      setAlertRulesPhase("idle");
    }
  }

  function handleToggleAlertRuleEnabled(rule: AlertRuleRow, nextEnabled: boolean) {
    const parsed = parseAlertRuleOverridesJson(alertRulesJson);
    if (parsed.error) {
      setErrorMessage(parsed.error);
      return;
    }
    setErrorMessage("");
    setAlertRulesIoSummary("");
    const defaultRule = alertRuleDefaultsById.get(rule.id) ?? rule;
    const next = setAlertRuleEnabledOverride(parsed.rules, defaultRule, nextEnabled);
    setAlertRulesJson(`${JSON.stringify(next, null, 2)}\n`);
  }

  function handleEditAlertRule(rule: AlertRuleRow, patch: Partial<AlertRuleOverride>) {
    const parsed = parseAlertRuleOverridesJson(alertRulesJson);
    if (parsed.error) {
      setErrorMessage(parsed.error);
      return;
    }
    setErrorMessage("");
    setAlertRulesIoSummary("");
    const defaultRule = alertRuleDefaultsById.get(rule.id) ?? rule;
    const next = setAlertRuleOverrideFields(parsed.rules, defaultRule, patch);
    setAlertRulesJson(`${JSON.stringify(next, null, 2)}\n`);
  }

  function handleResetAlertRule(ruleId: string) {
    const parsed = parseAlertRuleOverridesJson(alertRulesJson);
    if (parsed.error) {
      setErrorMessage(parsed.error);
      return;
    }
    setErrorMessage("");
    setAlertRulesIoSummary("");
    const next = clearAlertRuleOverride(parsed.rules, ruleId);
    setAlertRulesJson(`${JSON.stringify(next, null, 2)}\n`);
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <ReportHeroCard
          kicker="Signal Settings"
          title="뉴스 기준 설정"
          description="먼저 내 상황 프로필을 입력하고, 필요할 때만 소스와 키워드를 조정하세요. JSON import/export는 고급 관리로 분리했습니다."
          action={(
            <>
              <Link href="/planning/v3/news" className={reportHeroActionLinkClassName}>
                Digest로 돌아가기
              </Link>
              <button
                type="button"
                disabled={saving || loading || !canSaveSettings}
                onClick={() => { void handleSave(); }}
                className={`${reportHeroPrimaryActionClassName} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {saving ? "저장 중..." : "뉴스 기준/내 상황 저장"}
              </button>
            </>
          )}
        >
          <p className="text-xs text-white/60">뉴스 기준 저장 시각: {formatDateTime(updatedAt)} · 내 상황 저장 시각: {formatDateTime(exposureUpdatedAt)} · 알림 규칙 적용 시각: {formatDateTime(alertRulesUpdatedAt)}</p>
          <p className="text-xs font-semibold text-white/80">{newsSettingsStatusText}</p>
          <ReportHeroStatGrid>
            <ReportHeroStatCard label="활성 소스" value={`${activeSourceCount}/${sources.length || 0}`} description="현재 반영되는 뉴스 소스 수" />
            <ReportHeroStatCard label="토픽 조정" value={`${overriddenTopicCount}개`} description="기본 키워드와 다르게 조정한 토픽" />
            <ReportHeroStatCard label="내 상황 입력" value={`${exposureCompletionCount}/10`} description="개인화 영향 계산에 쓰는 항목" />
            <ReportHeroStatCard label="사용 지표" value={`${enabledIndicatorCount}개`} description="카탈로그상 활성 상태" />
          </ReportHeroStatGrid>
          <div className="flex flex-wrap gap-2 text-xs">
            <a href="#news-settings-exposure" className={reportHeroAnchorLinkClassName}>내 상황 프로필</a>
            <a href="#news-settings-sources" className={reportHeroAnchorLinkClassName}>소스 우선순위</a>
            <a href="#news-settings-topics" className={reportHeroAnchorLinkClassName}>토픽 키워드</a>
            <a href="#news-settings-alert-rules" className={reportHeroAnchorLinkClassName}>알림 규칙</a>
            <a href="#news-settings-advanced" className={reportHeroAnchorLinkClassName}>고급 관리</a>
          </div>
          {notice ? <p className="text-xs font-semibold text-emerald-300">{notice}</p> : null}
          {errorMessage ? <p className="text-xs font-semibold text-rose-300">{errorMessage}</p> : null}
        </ReportHeroCard>

        <Card id="news-settings-exposure" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">내 상황 프로필</h2>
            <p className="text-xs text-slate-500">먼저 내 상황을 입력하면 뉴스 요약과 시나리오 우선순위가 더 개인화됩니다. 모르는 항목은 미입력으로 두어도 됩니다.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">부채 보유</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.hasDebt} onChange={(event) => updateExposure("hasDebt", event.target.value as ExposureDraft["hasDebt"])}>
                <option value="unknown">미입력</option>
                <option value="yes">있음</option>
                <option value="no">없음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">금리 유형</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.rateType} onChange={(event) => updateExposure("rateType", event.target.value as ExposureDraft["rateType"])}>
                <option value="unknown">미입력</option>
                <option value="fixed">고정</option>
                <option value="variable">변동</option>
                <option value="mixed">혼합</option>
                <option value="none">해당 없음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">재조정 민감도</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.repricingHorizon} onChange={(event) => updateExposure("repricingHorizon", event.target.value as ExposureDraft["repricingHorizon"])}>
                <option value="unknown">미입력</option>
                <option value="short">단기</option>
                <option value="medium">중기</option>
                <option value="long">장기</option>
                <option value="none">해당 없음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">필수지출 비중</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.essentialExpenseShare} onChange={(event) => updateExposure("essentialExpenseShare", event.target.value as ExposureDraft["essentialExpenseShare"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">주거비 비중</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.rentOrMortgageShare} onChange={(event) => updateExposure("rentOrMortgageShare", event.target.value as ExposureDraft["rentOrMortgageShare"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">에너지비 비중</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.energyShare} onChange={(event) => updateExposure("energyShare", event.target.value as ExposureDraft["energyShare"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">해외소비 노출</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.foreignConsumption} onChange={(event) => updateExposure("foreignConsumption", event.target.value as ExposureDraft["foreignConsumption"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">외화소득 노출</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.foreignIncome} onChange={(event) => updateExposure("foreignIncome", event.target.value as ExposureDraft["foreignIncome"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">소득 안정성</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.incomeStability} onChange={(event) => updateExposure("incomeStability", event.target.value as ExposureDraft["incomeStability"])}>
                <option value="unknown">미입력</option>
                <option value="stable">안정</option>
                <option value="moderate">보통</option>
                <option value="fragile">취약</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">현금완충력</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.monthsOfCashBuffer} onChange={(event) => updateExposure("monthsOfCashBuffer", event.target.value as ExposureDraft["monthsOfCashBuffer"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
          </div>
        </Card>

        <Card id="news-settings-sources" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">소스 우선순위</h2>
            <p className="text-xs text-slate-500">자주 참고할 출처만 남기고, 신뢰도가 높다고 보는 소스의 가중치를 조금 더 높게 둘 수 있습니다.</p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : (
            <div className="space-y-3">
              {sources.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{row.name}</p>
                      <p className="truncate text-xs text-slate-500">{row.feedUrl}</p>
                      <p className="text-xs text-slate-500">{row.country} · {row.language} · 기본 가중치 {row.defaultWeight}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={sourceDrafts[row.id]?.enabled ?? row.defaultEnabled}
                          onChange={(event) => updateSourceEnabled(row.id, event.target.checked)}
                        />
                        사용
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        가중치
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="3"
                          value={sourceDrafts[row.id]?.weight ?? String(row.defaultWeight)}
                          onChange={(event) => updateSourceWeight(row.id, event.target.value)}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card id="news-settings-topics" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">토픽 키워드 조정</h2>
            <p className="text-xs text-slate-500">줄바꿈 또는 쉼표로 키워드를 구분하세요. 비워두면 기본 키워드를 그대로 사용합니다.</p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : (
            <div className="space-y-4">
              {topics.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-bold text-slate-900">{row.label}</p>
                  <p className="mt-1 text-xs text-slate-500">기본 키워드: {row.defaultKeywords.join(", ")}</p>
                  <textarea
                    value={topicDrafts[row.id]?.keywordsText ?? ""}
                    onChange={(event) => updateTopicKeywords(row.id, event.target.value)}
                    placeholder="로컬 오버라이드 키워드 입력"
                    rows={4}
                    className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-xs text-slate-700"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card id="news-settings-advanced" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">고급 관리</h2>
            <p className="text-xs text-slate-500">JSON import/export와 지표 스펙 편집은 필요할 때만 펼쳐서 사용하세요.</p>
          </div>

          <details
            id="news-settings-alert-rules"
            className="rounded-xl border border-slate-200 p-3"
            open={shouldOpenAlertRulesPanel(alertRuleDraftEffective.length, alertRulesLoadError)}
          >
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">알림 규칙 오버라이드</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500">먼저 아래 토글과 빠른 조정으로 규칙 조건을 바꾸고, 구조를 더 바꿔야 할 때만 아래 JSON 오버라이드를 직접 수정하세요.</p>
              <p className="text-xs text-slate-500">현재 오버라이드 {alertRuleOverridesCount}개 · 활성 규칙 {enabledAlertRuleCount}/{alertRuleDraftEffective.length}개 · 마지막 적용 {formatDateTime(alertRulesUpdatedAt)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void handleExportAlertRules(); }}
                  disabled={loading || initialLoadFailed || !!alertRulesLoadError || alertRulesPhase !== "idle" || alertRulesDirty}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  {loading || alertRulesPhase === "reloading" ? "불러오는 중..." : "현재 적용값 불러오기"}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleApplyAlertRules(); }}
                  disabled={loading || initialLoadFailed || alertRulesPhase !== "idle" || !!alertRulesLoadError || !!parsedAlertRulesDraft.error || !alertRulesDirty}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {alertRulesPhase === "applying" ? "알림 규칙 적용 중..." : "알림 규칙 적용"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">적용 뒤 결과 확인</span>
                <Link href="/planning/v3/news/alerts" className={ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME}>
                  알림함 확인
                </Link>
                <Link href="/planning/v3/news" className={ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME}>
                  Digest 확인
                </Link>
              </div>
              <p className={`text-xs font-semibold ${alertRulesDirty ? "text-amber-700" : "text-slate-500"}`}>
                {alertRulesSectionStatusText}
              </p>
              <p className="text-xs text-slate-500">마지막 적용 시각: {formatDateTime(alertRulesUpdatedAt)}</p>
              {parsedAlertRulesDraft.error ? <p className="text-xs font-semibold text-amber-700">{parsedAlertRulesDraft.error}</p> : null}
              {alertRulesLoadError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">알림 규칙을 지금 불러오지 못했습니다.</p>
                  <p className="mt-1 text-xs text-amber-800">규칙이 비어 보일 수 있으니 다시 불러온 뒤 조정해 주세요.</p>
                  <p className="mt-1 text-xs text-amber-700">{alertRulesLoadError}</p>
                  <button
                    type="button"
                    onClick={() => { void handleReloadAlertRules(); }}
                    disabled={alertRulesPhase !== "idle" || alertRulesDirty}
                    className="mt-3 rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-60"
                  >
                    적용값 다시 불러오기
                  </button>
                </div>
              ) : (
                <>
                  <textarea
                    value={alertRulesJson}
                    onChange={(event) => setAlertRulesJson(event.target.value)}
                    rows={8}
                    className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700"
                    placeholder="Alert rule override JSON 배열"
                  />
                  {alertRulesIoSummary ? <p className="text-xs font-semibold text-emerald-700">{alertRulesIoSummary}</p> : null}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-700">현재 유효 규칙 ({alertRuleDraftEffective.length})</p>
                    {alertRuleDraftEffective.length < 1 ? (
                      <p className="text-xs text-slate-500">표시할 알림 규칙이 없습니다. 내보내기로 현재 상태를 다시 불러올 수 있습니다.</p>
                    ) : (
                      <div className="max-h-72 overflow-auto rounded border border-slate-200">
                        <table className="min-w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-100 text-slate-700">
                            <tr>
                              <th className="px-2 py-1">규칙</th>
                              <th className="px-2 py-1">유형</th>
                              <th className="px-2 py-1">현재 조건</th>
                              <th className="px-2 py-1">빠른 조정</th>
                              <th className="px-2 py-1">오버라이드</th>
                              <th className="px-2 py-1">사용</th>
                            </tr>
                          </thead>
                          <tbody>
                            {alertRuleDraftEffective.map((row) => {
                              const hasOverride = parsedAlertRulesDraft.rules.some((override) => override.id === row.id);
                              const targetCandidates = row.targetType === "item"
                                ? alertRuleItemCandidates
                                : row.targetType === "scenario"
                                  ? alertRuleScenarioCandidates
                                  : [];
                              const matchedTargetCandidate = targetCandidates.find((candidate) => candidate.id === row.targetId) ?? null;
                              return (
                              <tr key={`alert-rule-${row.id}`} className="border-t border-slate-200 text-slate-700">
                            <td className="px-2 py-1 align-top">
                              <p className="font-semibold text-slate-900">{asString(row.name) || asString(row.id) || "-"}</p>
                              <p className="text-[11px] text-slate-500">{asString(row.id) || "-"}</p>
                            </td>
                            <td className="px-2 py-1 align-top">{formatAlertRuleKind(row.kind)}</td>
                            <td className="px-2 py-1 align-top">{formatAlertRuleSummary(row)}</td>
                            <td className="px-2 py-1 align-top">
                              <div className="flex min-w-60 flex-col gap-2">
                                <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                  <span>중요도</span>
                                  <select
                                    value={row.level ?? "medium"}
                                    onChange={(event) => handleEditAlertRule(row, {
                                      level: event.target.value as AlertRuleLevel,
                                    })}
                                    className="min-w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                                  >
                                    <option value="high">높음</option>
                                    <option value="medium">중간</option>
                                    <option value="low">낮음</option>
                                  </select>
                                </label>
                                {row.kind === "topic_burst" ? (
                                  <>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>토픽 범위</span>
                                      <select
                                        value={row.topicId ?? "*"}
                                        onChange={(event) => handleEditAlertRule(row, {
                                          topicId: event.target.value,
                                        })}
                                        className="min-w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                                      >
                                        <option value="*">전체 토픽</option>
                                        {topics.map((topic) => (
                                          <option key={`alert-rule-topic-${topic.id}`} value={topic.id}>
                                            {topic.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>급증 단계</span>
                                      <select
                                        value={row.minBurstLevel ?? "중"}
                                        onChange={(event) => handleEditAlertRule(row, {
                                          minBurstLevel: event.target.value as "중" | "상",
                                        })}
                                        className="min-w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                                      >
                                        <option value="중">중 이상</option>
                                        <option value="상">상만</option>
                                      </select>
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>당일 건수</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={Number.isFinite(row.minTodayCount) ? String(row.minTodayCount) : ""}
                                        onChange={(event) => {
                                          const nextValue = event.target.value.trim();
                                          if (!nextValue) {
                                            handleEditAlertRule(row, { minTodayCount: undefined });
                                            return;
                                          }
                                          const parsed = Number(nextValue);
                                          if (!Number.isInteger(parsed) || parsed < 0) return;
                                          handleEditAlertRule(row, { minTodayCount: parsed });
                                        }}
                                        className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                                      />
                                    </label>
                                  </>
                                ) : null}
                                {row.kind === "indicator" ? (
                                  <>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>지표 series</span>
                                      <div className="flex min-w-0 flex-1 justify-end">
                                        <input
                                          type="text"
                                          list={`alert-rule-series-${row.id}`}
                                          value={row.seriesId ?? ""}
                                          onChange={(event) => {
                                            const nextValue = event.target.value.trim();
                                            handleEditAlertRule(row, { seriesId: nextValue || undefined });
                                          }}
                                          className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                                        />
                                        <datalist id={`alert-rule-series-${row.id}`}>
                                          {indicatorCatalog.map((series) => (
                                            <option key={`alert-rule-series-option-${row.id}-${series.id}`} value={series.id}>
                                              {series.displayLabel}
                                            </option>
                                          ))}
                                        </datalist>
                                      </div>
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>지표 보기</span>
                                      <select
                                        value={row.metric ?? "pctChange"}
                                        onChange={(event) => handleEditAlertRule(row, {
                                          metric: event.target.value as AlertRuleMetric,
                                        })}
                                        className="min-w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                                      >
                                        <option value="pctChange">변화율</option>
                                        <option value="zscore">표준점수</option>
                                        <option value="regime">추세</option>
                                      </select>
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>판정 조건</span>
                                      <select
                                        value={row.condition ?? "unknown"}
                                        onChange={(event) => handleEditAlertRule(row, {
                                          condition: event.target.value as AlertRuleCondition,
                                        })}
                                        className="min-w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                                      >
                                        <option value="up">상승</option>
                                        <option value="down">하락</option>
                                        <option value="high">고점권</option>
                                        <option value="low">저점권</option>
                                        <option value="flat">횡보</option>
                                        <option value="unknown">데이터 부족</option>
                                      </select>
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>비교 기간</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        step="1"
                                        value={Number.isFinite(row.window) ? String(row.window) : ""}
                                        onChange={(event) => {
                                          const nextValue = event.target.value.trim();
                                          if (!nextValue) {
                                            handleEditAlertRule(row, { window: undefined });
                                            return;
                                          }
                                          const parsed = Number(nextValue);
                                          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) return;
                                          handleEditAlertRule(row, { window: parsed });
                                        }}
                                        className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                                      />
                                    </label>
                                    {row.metric !== "regime" || Number.isFinite(row.threshold) ? (
                                      <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                        <span>기준값</span>
                                        <input
                                          type="number"
                                          step="0.1"
                                          value={Number.isFinite(row.threshold) ? String(row.threshold) : ""}
                                          onChange={(event) => {
                                            const nextValue = event.target.value.trim();
                                            if (!nextValue) {
                                              handleEditAlertRule(row, { threshold: undefined });
                                              return;
                                            }
                                            const parsed = Number(nextValue);
                                            if (!Number.isFinite(parsed)) return;
                                            handleEditAlertRule(row, { threshold: parsed });
                                          }}
                                          className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                                        />
                                      </label>
                                    ) : null}
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>연결 대상</span>
                                      <select
                                        value={row.targetType ?? "topic"}
                                        onChange={(event) => handleEditAlertRule(row, {
                                          targetType: event.target.value as AlertRuleTargetType,
                                        })}
                                        className="min-w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                                      >
                                        <option value="topic">토픽</option>
                                        <option value="scenario">시나리오</option>
                                        <option value="series">지표</option>
                                        <option value="item">기사</option>
                                      </select>
                                    </label>
                                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                      <span>대상 ID</span>
                                      <div className="flex min-w-0 flex-1 justify-end">
                                        <input
                                          type="text"
                                          list={`alert-rule-target-${row.id}`}
                                          value={row.targetId ?? ""}
                                          onChange={(event) => {
                                            const nextValue = event.target.value.trim();
                                            handleEditAlertRule(row, { targetId: nextValue || undefined });
                                          }}
                                          className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                                          placeholder={row.targetType === "scenario"
                                            ? "예: Bear"
                                            : row.targetType === "topic"
                                              ? "예: fx"
                                              : row.targetType === "item"
                                                ? "예: https://news.example/item"
                                                : ""}
                                        />
                                        <datalist id={`alert-rule-target-${row.id}`}>
                                          {getAlertRuleTargetIdSuggestions(row.targetType, topics, indicatorCatalog, {
                                            scenarioCandidates: alertRuleScenarioCandidates,
                                            itemCandidates: alertRuleItemCandidates,
                                          }).map((targetId) => (
                                            <option
                                              key={`alert-rule-target-option-${row.id}-${targetId}`}
                                              value={targetId}
                                              label={
                                                targetCandidates.find((candidate) => candidate.id === targetId)?.label
                                                ?? targetId
                                              }
                                            />
                                          ))}
                                        </datalist>
                                      </div>
                                    </label>
                                    {row.targetType === "item" || row.targetType === "scenario" ? (
                                      <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                        <span>{row.targetType === "item" ? "후보 선택" : "시나리오 후보"}</span>
                                        <select
                                          value={matchedTargetCandidate?.id ?? ""}
                                          onChange={(event) => {
                                            const nextValue = event.target.value.trim();
                                            handleEditAlertRule(row, { targetId: nextValue || undefined });
                                          }}
                                          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                                        >
                                          <option value="">
                                            {targetCandidates.length > 0 ? "직접 입력 유지" : "현재 후보 없음"}
                                          </option>
                                          {targetCandidates.map((candidate) => (
                                            <option key={`alert-rule-target-picker-${row.id}-${candidate.id}`} value={candidate.id}>
                                              {candidate.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    ) : null}
                                    {row.targetType === "item" || row.targetType === "scenario" ? (
                                      <p className="text-[10px] text-slate-500">
                                        {matchedTargetCandidate
                                          ? `${row.targetType === "item" ? "선택 기사" : "선택 시나리오"}: ${matchedTargetCandidate.label}${matchedTargetCandidate.detail ? ` · ${matchedTargetCandidate.detail}` : ""}`
                                          : getAlertRuleTargetPickerHint(row.targetType, targetCandidates.length)}
                                      </p>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-2 py-1 align-top">
                              {hasOverride ? (
                                <button
                                  type="button"
                                  onClick={() => handleResetAlertRule(row.id)}
                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                                >
                                  기본값 복원
                                </button>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-2 py-1 align-top">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={row.enabled !== false}
                                  onChange={(event) => handleToggleAlertRuleEnabled(row, event.target.checked)}
                                />
                                <span>{row.enabled === false ? "비활성" : "활성"}</span>
                              </label>
                            </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </details>

          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">RSS Sources Import / Export</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500">JSON 배열 형식: <code>{"[{\"url\":\"https://example.com/rss.xml\",\"weight\":1.2,\"enabled\":true}]"}</code> · 본문/아이템 데이터는 포함되지 않습니다.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void handleExportSources(); }}
                  disabled={sourcesIoLoading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  내보내기
                </button>
                <button
                  type="button"
                  onClick={() => { void handleImportSources("dry_run"); }}
                  disabled={sourcesIoLoading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Dry-run
                </button>
                <button
                  type="button"
                  onClick={() => { void handleImportSources("apply"); }}
                  disabled={sourcesIoLoading}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  적용
                </button>
              </div>
              <textarea
                value={sourcesJson}
                onChange={(event) => setSourcesJson(event.target.value)}
                rows={8}
                className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700"
                placeholder="RSS source JSON 배열"
              />
              {sourcesIoSummary ? <p className="text-xs font-semibold text-emerald-700">{sourcesIoSummary}</p> : null}
            </div>
          </details>

          <details id="indicator-series-specs" className="rounded-xl border border-slate-200 p-3" open={indicatorCatalog.length > 0}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Indicator SeriesSpec Import / Export</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500">series spec만 import/export 하며 키/토큰은 포함되지 않습니다. import는 strict validation + dry-run을 먼저 수행하세요.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void handleExportSpecs(); }}
                  disabled={specsIoLoading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  내보내기
                </button>
                <button
                  type="button"
                  onClick={() => { void handleImportSpecs("dry_run"); }}
                  disabled={specsIoLoading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Dry-run
                </button>
                <button
                  type="button"
                  onClick={() => { void handleImportSpecs("apply"); }}
                  disabled={specsIoLoading}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  적용
                </button>
              </div>
              <textarea
                value={specsJson}
                onChange={(event) => setSpecsJson(event.target.value)}
                rows={10}
                className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700"
                placeholder="SeriesSpec JSON 배열"
              />
              {specsIoSummary ? <p className="text-xs font-semibold text-emerald-700">{specsIoSummary}</p> : null}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">Indicator Catalog ({indicatorCatalog.length})</p>
                {indicatorCatalog.length < 1 ? (
                  <p className="text-xs text-slate-500">카탈로그 데이터가 없습니다.</p>
                ) : (
                  <div className="max-h-72 overflow-auto rounded border border-slate-200">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-2 py-1">Series ID</th>
                          <th className="px-2 py-1">표시 라벨</th>
                          <th className="px-2 py-1">카테고리</th>
                          <th className="px-2 py-1">소스</th>
                          <th className="px-2 py-1">주기</th>
                          <th className="px-2 py-1">사용</th>
                        </tr>
                      </thead>
                      <tbody>
                        {indicatorCatalog.map((row) => (
                          <tr key={`catalog-${row.id}`} className="border-t border-slate-200 text-slate-700">
                            <td className="px-2 py-1 font-mono">{row.id}</td>
                            <td className="px-2 py-1">{asString(row.displayLabel) || asString(row.annotation?.label) || asString(row.name)}</td>
                            <td className="px-2 py-1">{formatIndicatorCategory(row.annotation?.category)}</td>
                            <td className="px-2 py-1">{asString(row.sourceId)}</td>
                            <td className="px-2 py-1">{asString(row.frequency)}</td>
                            <td className="px-2 py-1">{row.enabled === false ? "비활성" : "활성"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </details>
        </Card>

        <Card className="sticky bottom-4 z-10 border-slate-900 bg-slate-900 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{newsSettingsStatusText}</p>
              <p className="text-xs text-slate-300">{newsSettingsDetailText}</p>
            </div>
            <button
              type="button"
              disabled={saving || loading || !canSaveSettings}
              onClick={() => { void handleSave(); }}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "저장 중..." : "뉴스 기준/내 상황 저장"}
            </button>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
