"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import {
  reportHeroActionLinkClassName,
  reportHeroAnchorLinkClassName,
  reportHeroPrimaryActionClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { NewsNavigation } from "../../_components/NewsNavigation";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type DigestDay } from "@/lib/planning/v3/news/digest";
import { type NewsScenarioPack } from "@/lib/planning/v3/news/scenarios";
import { cn } from "@/lib/utils";

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

const ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-all uppercase tracking-widest";

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

function shouldOpenAlertRulesPanel(ruleCount: number, loadError: string): boolean {
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
          headers: { "x-requested-with": "XMLHttpRequest" },
        }),
        fetch("/api/planning/v3/exposure/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "x-requested-with": "XMLHttpRequest" },
        }),
      ]);
      const [specsResponse, alertRulesResponse] = await Promise.all([
        fetch("/api/planning/v3/indicators/specs", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "x-requested-with": "XMLHttpRequest" },
        }).catch(() => null),
        fetch("/api/planning/v3/news/alerts/rules", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "x-requested-with": "XMLHttpRequest" },
        }).catch(() => null),
      ]);
      const settingsPayload = (await settingsResponse.json().catch(() => null)) as GetSettingsResponse | null;
      const exposurePayload = (await exposureResponse.json().catch(() => null)) as ExposureResponse | null;
      const specsPayload = specsResponse ? (await specsResponse.json().catch(() => null)) as IndicatorSpecsGetResponse | null : null;
      const alertRulesPayload = alertRulesResponse ? (await alertRulesResponse.json().catch(() => null)) as AlertRulesGetResponse | null : null;

      if (!settingsResponse.ok || settingsPayload?.ok !== true || !settingsPayload.data) {
        throw new Error(settingsPayload?.error?.message ?? `HTTP ${settingsResponse.status}`);
      }
      if (!exposureResponse.ok || exposurePayload?.ok !== true) {
        throw new Error(exposurePayload?.error?.message ?? `HTTP ${exposureResponse.status}`);
      }
      if (specsResponse?.ok && specsPayload?.ok === true) applyIndicatorSpecsResponse(specsPayload);
      if (alertRulesResponse?.ok && alertRulesPayload?.ok === true) applyAlertRulesResponse(alertRulesPayload);

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

  const settingsDirty = useMemo(() => {
    for (const row of sources) {
      const draft = sourceDrafts[row.id] ?? { id: row.id, enabled: row.defaultEnabled, weight: String(row.defaultWeight) };
      const initial = initialSourceDrafts[row.id] ?? draft;
      if (draft.enabled !== initial.enabled || normalizeWeightInput(draft.weight) !== normalizeWeightInput(initial.weight)) return true;
    }
    for (const row of topics) {
      const draft = topicDrafts[row.id] ?? { id: row.id, keywordsText: "" };
      const initial = initialTopicDrafts[row.id] ?? draft;
      const parsed = parseKeywords(draft.keywordsText);
      const initialParsed = parseKeywords(initial.keywordsText);
      if (parsed.length !== initialParsed.length || !parsed.every((token, idx) => token === initialParsed[idx])) return true;
    }
    return JSON.stringify(exposureDraft) !== JSON.stringify(initialExposureDraft);
  }, [exposureDraft, initialExposureDraft, initialSourceDrafts, initialTopicDrafts, sourceDrafts, sources, topicDrafts, topics]);

  const alertRulesDirty = useMemo(() => hasAlertRulesDraftChanges(alertRulesJson, initialAlertRulesJson), [alertRulesJson, initialAlertRulesJson]);
  const canSaveSettings = useMemo(() => canSaveNewsSettings(settingsDirty, alertRulesDirty), [alertRulesDirty, settingsDirty]);
  const alertRulesStateKnown = !loading && !initialLoadFailed && !alertRulesLoadError;
  const newsSettingsStatusText = loading ? "로딩 중..." : getNewsSettingsSaveStatus(settingsDirty, alertRulesDirty, alertRulesStateKnown);
  const alertRulesSectionStatusText = getAlertRulesSectionStatus(alertRulesDirty, alertRulesPhase, alertRulesStateKnown);
  const activeSourceCount = sources.filter((row) => (sourceDrafts[row.id]?.enabled ?? row.defaultEnabled)).length;
  const overriddenTopicCount = topics.filter((row) => {
    const parsed = parseKeywords(topicDrafts[row.id]?.keywordsText ?? "");
    return !(parsed.length === row.defaultKeywords.length && parsed.every((token, index) => token === row.defaultKeywords[index]));
  }).length;
  const exposureCompletionCount = countKnownExposureFields(exposureDraft);
  const enabledIndicatorCount = indicatorCatalog.filter((row) => row.enabled !== false).length;

  function updateSourceEnabled(id: string, value: boolean) {
    setSourceDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { id, enabled: value, weight: "1" }), enabled: value } }));
  }
  function updateSourceWeight(id: string, value: string) {
    setSourceDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { id, enabled: true, weight: value }), weight: value } }));
  }
  function updateTopicKeywords(id: string, value: string) {
    setTopicDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { id, keywordsText: "" }), keywordsText: value } }));
  }
  function updateExposure<K extends keyof ExposureDraft>(key: K, value: ExposureDraft[K]) {
    setExposureDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!canSaveSettings) return;
    setSaving(true);
    setErrorMessage("");
    setNotice("");
    try {
      const sourceOverrides = sources.map((row) => {
        const draft = sourceDrafts[row.id];
        const weight = Number.isFinite(Number(draft?.weight)) ? Number(draft?.weight) : row.defaultWeight;
        const enabled = draft?.enabled ?? row.defaultEnabled;
        return { id: row.id, enabled: enabled === row.defaultEnabled ? undefined : enabled, weight: Math.abs(weight - row.defaultWeight) <= 1e-9 ? undefined : weight };
      }).filter((row) => typeof row.enabled === "boolean" || typeof row.weight === "number");

      const topicOverrides = topics.map((row) => {
        const parsed = parseKeywords(topicDrafts[row.id]?.keywordsText ?? "");
        return { id: row.id, keywords: (parsed.length === row.defaultKeywords.length && parsed.every((token, idx) => token === row.defaultKeywords[idx])) ? undefined : parsed };
      }).filter((row) => Array.isArray(row.keywords));

      const payload = withDevCsrf({ sources: sourceOverrides, topics: topicOverrides });
      if (!payload.csrf && csrf) payload.csrf = csrf;
      const res = await fetch("/api/planning/v3/news/settings", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("뉴스 기준 저장 실패");

      const expPayload = withDevCsrf({ profile: draftToProfile(exposureDraft) });
      if (!expPayload.csrf && csrf) expPayload.csrf = csrf;
      const expRes = await fetch("/api/planning/v3/exposure/profile", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" }, body: JSON.stringify(expPayload) });
      if (!expRes.ok) throw new Error("프로필 저장 실패");

      setNotice("저장되었습니다.");
      await load();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "저장 중 오류");
    } finally {
      setSaving(false);
    }
  }

  async function handleIo(target: "sources" | "specs", action: "export" | "import", mode?: "dry_run" | "apply") {
    const isLoading = target === "sources" ? setSourcesIoLoading : setSpecsIoLoading;
    const setSummary = target === "sources" ? setSourcesIoSummary : setSpecsIoSummary;
    isLoading(true);
    setErrorMessage("");
    setSummary("");
    try {
      const url = target === "sources" ? "/api/planning/v3/news/sources" : "/api/planning/v3/indicators/specs";
      if (action === "export") {
        const res = await fetch(url, { method: "GET", cache: "no-store", credentials: "same-origin", headers: { "x-requested-with": "XMLHttpRequest" } });
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error("내보내기 실패");
        const json = target === "sources" ? payload.data?.items : payload.data?.specs;
        if (target === "sources") setSourcesJson(`${JSON.stringify(json, null, 2)}\n`);
        else setSpecsJson(`${JSON.stringify(json, null, 2)}\n`);
        setSummary("내보내기 완료");
      } else {
        const body = target === "sources" ? { mode, items: JSON.parse(sourcesJson) } : { mode, specs: JSON.parse(specsJson) };
        const payload = withDevCsrf(body);
        if (!payload.csrf && csrf) payload.csrf = csrf;
        const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok || !result.ok) throw new Error("가져오기 실패");
        setSummary(`${mode === "apply" ? "적용" : "분석"} 완료`);
        if (mode === "apply") await load();
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "IO 작업 중 오류");
    } finally {
      isLoading(false);
    }
  }

  async function handleAlertRulesAction(action: "reload" | "apply") {
    setAlertRulesPhase(action === "reload" ? "reloading" : "applying");
    setErrorMessage("");
    setNotice("");
    setAlertRulesIoSummary("");
    try {
      if (action === "reload") {
        const res = await fetch("/api/planning/v3/news/alerts/rules", { method: "GET", cache: "no-store", credentials: "same-origin", headers: { "x-requested-with": "XMLHttpRequest" } });
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error("불러오기 실패");
        applyAlertRulesResponse(payload);
        setAlertRulesIoSummary("최신 상태를 불러왔습니다.");
      } else {
        const parsed = parseAlertRuleOverridesJson(alertRulesJson);
        if (parsed.error) throw new Error(parsed.error);
        const payload = withDevCsrf({ rules: parsed.rules });
        if (!payload.csrf && csrf) payload.csrf = csrf;
        const res = await fetch("/api/planning/v3/news/alerts/rules", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" }, body: JSON.stringify(payload) });
        const result = await res.json();
        if (!res.ok || !result.ok) throw new Error("적용 실패");
        applyAlertRulesResponse(result);
        setAlertRulesIoSummary("적용 완료");
        setNotice("알림 규칙이 적용되었습니다.");
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "알림 규칙 작업 오류");
    } finally {
      setAlertRulesPhase("idle");
    }
  }

  return (
    <PageShell>
      <div className="space-y-8">
        <ReportHeroCard
          kicker="Signal Settings"
          title="뉴스 및 알림 설정"
          description="구독할 뉴스 소스를 관리하거나 관심 토픽을 설정하여 나만의 재무 브리핑을 최적화하세요. 프로필을 상세히 입력할수록 분석이 정확해집니다."
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving || loading || !canSaveSettings}
                onClick={() => { void handleSave(); }}
                className={cn(
                  reportHeroPrimaryActionClassName,
                  "disabled:opacity-60 transition-colors bg-emerald-600 hover:bg-emerald-500 border-emerald-500/50"
                )}
              >
                {saving ? "저장 중..." : "설정 저장"}
              </button>
            </div>
          )}
        >
          <NewsNavigation />

          <div className="mb-8 rounded-3xl bg-emerald-500/10 p-5 border border-emerald-500/20 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-2 w-2 flex-none animate-pulse rounded-full bg-emerald-400" />
              <p className="text-sm font-bold text-emerald-50 leading-relaxed tracking-tight">
                {newsSettingsStatusText}
              </p>
            </div>
          </div>

          <ReportHeroStatGrid className="xl:grid-cols-4">
            <ReportHeroStatCard
              label="활성 소스"
              value={`${activeSourceCount}/${sources.length}`}
              description="반영 중인 뉴스 미디어 수"
            />
            <ReportHeroStatCard
              label="토픽 최적화"
              value={`${overriddenTopicCount}개`}
              description="커스텀 키워드 적용 중"
            />
            <ReportHeroStatCard
              label="프로필 완성도"
              value={`${exposureCompletionCount}/10`}
              description="개인화 영향 분석 지표"
            />
            <ReportHeroStatCard
              label="지표 카탈로그"
              value={`${enabledIndicatorCount}개`}
              description="추적 중인 활성 지표 수"
            />
          </ReportHeroStatGrid>

          <div className="mt-8 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
            <span className="text-white/40 mr-2">Quick Navigation</span>
            <a href="#news-settings-exposure" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>상황 프로필</a>
            <a href="#news-settings-sources" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>뉴스 소스</a>
            <a href="#news-settings-topics" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>관심 토픽</a>
            <a href="#news-settings-alert-rules" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>알림 규칙</a>
            <a href="#news-settings-advanced" className={cn(reportHeroAnchorLinkClassName, "bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all")}>고급 설정</a>
          </div>

          {notice || errorMessage ? (
            <div className="mt-6 rounded-2xl bg-black/20 p-4 border border-white/5">
              {notice ? <p className="text-xs font-bold text-emerald-400 flex items-center gap-2"><span>✅</span> {notice}</p> : null}
              {errorMessage ? <p className="text-xs font-bold text-rose-400 flex items-center gap-2"><span>❌</span> {errorMessage}</p> : null}
            </div>
          ) : null}
        </ReportHeroCard>

        <Card id="news-settings-exposure" className="rounded-[2.5rem] p-8 shadow-sm">
          <SubSectionHeader title="내 상황 프로필" description="입력할수록 뉴스 해석과 시나리오 영향 분석이 정확해집니다." />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "부채 보유", key: "hasDebt", options: [["unknown", "미입력"], ["yes", "있음"], ["no", "없음"]] },
              { label: "금리 유형", key: "rateType", options: [["unknown", "미입력"], ["fixed", "고정"], ["variable", "변동"], ["mixed", "혼합"], ["none", "해당 없음"]] },
              { label: "재조정 민감도", key: "repricingHorizon", options: [["unknown", "미입력"], ["short", "단기"], ["medium", "중기"], ["long", "장기"], ["none", "해당 없음"]] },
              { label: "필수지출 비중", key: "essentialExpenseShare", options: [["unknown", "미입력"], ["low", "낮음"], ["medium", "중간"], ["high", "높음"]] },
              { label: "주거비 비중", key: "rentOrMortgageShare", options: [["unknown", "미입력"], ["low", "낮음"], ["medium", "중간"], ["high", "높음"]] },
              { label: "소득 안정성", key: "incomeStability", options: [["unknown", "미입력"], ["stable", "안정"], ["moderate", "보통"], ["fragile", "취약"]] },
            ].map((field) => (
              <label key={field.key} className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{field.label}</span>
                <select
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 focus:border-emerald-500 outline-none transition-all"
                  value={exposureDraft[field.key as keyof ExposureDraft]}
                  onChange={(e) => updateExposure(field.key as keyof ExposureDraft, e.target.value as ExposureDraft[keyof ExposureDraft])}
                >
                  {field.options.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
                </select>
              </label>
            ))}
          </div>
        </Card>

        <Card id="news-settings-sources" className="rounded-[2.5rem] p-8 shadow-sm">
          <SubSectionHeader title="소스 우선순위" description="뉴스 소스를 켜고 끄거나, 가중치를 0~3 사이로 조정합니다." />
          {loading ? <p className="animate-pulse text-sm text-slate-500">불러오는 중...</p> : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sources.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-200 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-black text-slate-900 tracking-tight">{row.name}</p>
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked={sourceDrafts[row.id]?.enabled ?? row.defaultEnabled} onChange={(e) => updateSourceEnabled(row.id, e.target.checked)} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-4">{row.country} · {row.language} · DEFAULT {row.defaultWeight}</p>
                  <label className="flex items-center justify-between border-t border-slate-50 pt-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">가중치</span>
                    <input type="number" step="0.1" min="0" max="3" value={sourceDrafts[row.id]?.weight ?? String(row.defaultWeight)} onChange={(e) => updateSourceWeight(row.id, e.target.value)} className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                  </label>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card id="news-settings-topics" className="rounded-[2.5rem] p-8 shadow-sm">
          <SubSectionHeader title="토픽 키워드" description="기본 키워드를 대체하고 싶을 때만 입력하세요 (줄바꿈/쉼표 구분)." />
          <div className="grid gap-6 md:grid-cols-2">
            {topics.map((row) => (
              <div key={row.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-base font-black text-slate-900 tracking-tight mb-2">{row.label}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-4 truncate">기본: {row.defaultKeywords.join(", ")}</p>
                <textarea value={topicDrafts[row.id]?.keywordsText ?? ""} onChange={(e) => updateTopicKeywords(row.id, e.target.value)} placeholder="기본 키워드 대신 사용할 단어들..." rows={3} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 focus:border-emerald-500 outline-none transition-all" />
              </div>
            ))}
          </div>
        </Card>

        <Card id="news-settings-advanced" className="rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
          <SubSectionHeader title="고급 관리 및 알림 규칙" description="알림 조건 오버라이드 및 소스/지표 JSON 대량 관리를 처리합니다." />

          <details id="news-settings-alert-rules" className="group rounded-[2rem] border border-slate-200 bg-slate-50/50 p-6 mb-6" open={shouldOpenAlertRulesPanel(alertRuleDraftEffective.length, "")}>
            <summary className="cursor-pointer list-none flex items-center justify-between">
              <div className="flex items-center gap-3"><span className="transition-transform group-open:rotate-90 text-slate-400 text-xs">▶</span><p className="text-sm font-black text-slate-900 uppercase tracking-widest">알림 규칙 오버라이드 (JSON)</p></div>
              <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-0.5 rounded-full tabular-nums">OVERRIDE: {alertRuleOverridesCount}</span>
            </summary>
            <div className="mt-6 space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <button type="button" onClick={() => void handleAlertRulesAction("reload")} disabled={alertRulesPhase !== "idle" || alertRulesDirty} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 shadow-sm transition-all"> {alertRulesPhase === "reloading" ? "로딩 중..." : "적용값 불러오기"} </button>
                  <button type="button" onClick={() => void handleAlertRulesAction("apply")} disabled={alertRulesPhase !== "idle" || !alertRulesDirty} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60 shadow-sm transition-all"> {alertRulesPhase === "applying" ? "적용 중..." : "규칙 적용"} </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest"> <span className="text-slate-500">결과 확인:</span> <Link href="/planning/v3/news/alerts" className={ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME}>알림함 ▶</Link> <Link href="/planning/v3/news" className={ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME}>Digest ▶</Link> </div>
              </div>
              <textarea value={alertRulesJson} onChange={(e) => setAlertRulesJson(e.target.value)} rows={6} className="w-full rounded-2xl border border-slate-200 bg-slate-950 p-5 font-mono text-[11px] text-emerald-400 outline-none focus:ring-1 focus:ring-emerald-500 shadow-inner" placeholder="JSON 오버라이드 입력..." />
              {alertRulesIoSummary && <p className="text-xs font-bold text-emerald-600">✅ {alertRulesIoSummary}</p>}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">활성 규칙 리스트 ({alertRuleDraftEffective.length})</p>
                <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full text-left">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-100"><tr className="text-[10px] font-black uppercase tracking-widest text-slate-400"><th className="px-4 py-3">유형</th><th className="px-4 py-3">조건</th><th className="px-4 py-3 text-center">상태</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {alertRuleDraftEffective.map((row) => (
                        <tr key={row.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-4"><p className="text-xs font-black text-slate-900">{asString(row.name) || row.id}</p><p className="text-[10px] font-bold text-slate-400 uppercase">{formatAlertRuleKind(row.kind)}</p></td>
                          <td className="px-4 py-4 text-xs font-medium text-slate-600 leading-relaxed">{formatAlertRuleSummary(row)}</td>
                          <td className="px-4 py-4 text-center"><span className={cn("inline-block rounded-lg px-2 py-0.5 text-[10px] font-black tabular-nums", row.enabled !== false ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400")}>{row.enabled !== false ? "ACTIVE" : "DISABLED"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </details>

          <details className="group rounded-[2rem] border border-slate-200 bg-slate-50/50 p-6">
            <summary className="cursor-pointer list-none flex items-center justify-between">
              <div className="flex items-center gap-3"><span className="transition-transform group-open:rotate-90 text-slate-400 text-xs">▶</span><p className="text-sm font-black text-slate-900 uppercase tracking-widest">소스 및 지표 벌크 IO (고급)</p></div>
            </summary>
            <div className="mt-6 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between"><p className="text-xs font-black text-slate-900 uppercase tracking-widest">뉴스 소스 데이터 (JSON)</p></div>
                <textarea value={sourcesJson} onChange={(e) => setSourcesJson(e.target.value)} rows={4} className="w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-[10px] text-sky-400 outline-none shadow-inner" />
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={sourcesIoLoading} onClick={() => void handleIo("sources", "export")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all">내보내기</button>
                  <button type="button" disabled={sourcesIoLoading} onClick={() => void handleIo("sources", "import", "dry_run")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all">가져오기 (Dry-run)</button>
                  <button type="button" disabled={sourcesIoLoading} onClick={() => void handleIo("sources", "import", "apply")} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-black text-white hover:bg-slate-800 shadow-sm transition-all">가져오기 (적용)</button>
                </div>
                {sourcesIoSummary && <p className="text-[11px] font-bold text-emerald-600">✅ {sourcesIoSummary}</p>}
              </div>
              <div className="space-y-4 pt-6 border-t border-slate-200">
                <div className="flex items-center justify-between"><p className="text-xs font-black text-slate-900 uppercase tracking-widest">지표 Series Specs (JSON)</p></div>
                <textarea value={specsJson} onChange={(e) => setSpecsJson(e.target.value)} rows={4} className="w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-[10px] text-sky-400 outline-none shadow-inner" />
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={specsIoLoading} onClick={() => void handleIo("specs", "export")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all">내보내기</button>
                  <button type="button" disabled={specsIoLoading} onClick={() => void handleIo("specs", "import", "dry_run")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all">가져오기 (Dry-run)</button>
                  <button type="button" disabled={specsIoLoading} onClick={() => void handleIo("specs", "import", "apply")} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-black text-white hover:bg-slate-800 shadow-sm transition-all">가져오기 (적용)</button>
                </div>
                {specsIoSummary && <p className="text-[11px] font-bold text-emerald-600">✅ {specsIoSummary}</p>}
              </div>
            </div>
          </details>
          <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-100"><p className="text-xs font-bold text-amber-800 leading-relaxed tabular-nums">알림 규칙 적용 상태: {alertRulesSectionStatusText}</p></div>
        </Card>
      </div>
    </PageShell>
  );
}
