import { type HTMLAttributes } from "react";

export type NewsSettingsClientProps = {
  csrf?: string;
};

export type SourceRow = {
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

export type TopicRow = {
  id: string;
  label: string;
  defaultKeywords: string[];
  overrideKeywords: string[] | null;
  effectiveKeywords: string[];
};

export type GetSettingsResponse = {
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

export type IndicatorSeriesSpec = {
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

export type IndicatorCategory =
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

export type IndicatorCatalogRow = IndicatorSeriesSpec & {
  annotation: {
    seriesId: string;
    category: IndicatorCategory;
    label: string;
  };
  displayLabel: string;
};

export type IndicatorSpecsGetResponse = {
  ok?: boolean;
  data?: {
    specs?: IndicatorSeriesSpec[];
    catalog?: IndicatorCatalogRow[];
  } | null;
  error?: { message?: string };
};

export type AlertRuleLevel = "high" | "medium" | "low";
export type AlertRuleKind = "topic_burst" | "indicator";
export type AlertRuleMetric = "pctChange" | "zscore" | "regime";
export type AlertRuleCondition = "up" | "down" | "high" | "low" | "flat" | "unknown";
export type AlertRuleTargetType = "topic" | "item" | "scenario" | "series";

export type AlertRuleOverride = {
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

export type AlertRuleRow = AlertRuleOverride & {
  name?: string;
  kind?: AlertRuleKind;
};

export type AlertRulesResponseData = {
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

export type AlertRulesGetResponse = {
  ok?: boolean;
  data?: AlertRulesResponseData | null;
  error?: { message?: string };
};

export type AlertRulesPostResponse = {
  ok?: boolean;
  data?: AlertRulesResponseData | null;
  error?: { message?: string };
};

export const ALERT_RULES_FOLLOW_THROUGH_LINK_CLASSNAME = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-600 hover:bg-surface-muted transition-all uppercase tracking-widest";
export const SETTINGS_SECTION_REVEAL = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.34 } },
};

export const SETTINGS_STAGGER_REVEAL = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const SETTINGS_PANEL_CLASSNAME = "rounded-[2rem] border border-slate-200/90 bg-white px-5 py-5 shadow-sm shadow-slate-200/40 transition-colors duration-200 hover:border-slate-300";
export const SETTINGS_PANEL_SUBTLE_CLASSNAME = "rounded-[2rem] border border-slate-200/90 bg-surface-muted/85 px-5 py-5 shadow-sm shadow-slate-200/30 transition-colors duration-200 hover:border-slate-300";
export const SETTINGS_ROW_PANEL_CLASSNAME = "rounded-[1.5rem] border border-slate-200/80 bg-white px-4 py-4 transition-colors duration-200 hover:border-primary/10 hover:bg-primary/30";

export type ExposureProfile = {
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

export type ExposureResponse = {
  ok?: boolean;
  profile?: ExposureProfile | null;
  error?: {
    code?: string;
    message?: string;
  };
};

export type ExposureDraft = {
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

export type SourceDraft = {
  id: string;
  enabled: boolean;
  weight: string;
};

export type TopicDraft = {
  id: string;
  keywordsText: string;
};

export type NewsSettingsHeroState = {
  loading: boolean;
  saving: boolean;
  canSaveSettings: boolean;
  notice: string;
  errorMessage: string;
  updatedAt: string | null;
  newsSettingsStatusText: string;
  activeSourceCount: number;
  sourcesCount: number;
  overriddenTopicCount: number;
  exposureCompletionCount: number;
  enabledIndicatorCount: number;
  alertRulesDirty: boolean;
  alertRulesSectionStatusText: string;
};

export type NewsSettingsExposureState = {
  loading: boolean;
  draft: ExposureDraft;
  updateExposure: <K extends keyof ExposureDraft>(key: K, value: ExposureDraft[K]) => void;
};

export type NewsSettingsSourcesState = {
  loading: boolean;
  rows: SourceRow[];
  drafts: Record<string, SourceDraft>;
  updateSourceEnabled: (id: string, value: boolean) => void;
  updateSourceWeight: (id: string, value: string) => void;
};

export type NewsSettingsTopicsState = {
  rows: TopicRow[];
  drafts: Record<string, TopicDraft>;
  updateTopicKeywords: (id: string, value: string) => void;
};

export type NewsSettingsAdvancedState = {
  updatedAt: string | null;
  exposureUpdatedAt: string | null;
  alertRulesUpdatedAt: string | null;
  newsSettingsStatusText: string;
  alertRulesSectionStatusText: string;
  exposureCompletionCount: number;
  alertRulesPhase: "idle" | "reloading" | "applying";
  alertRulesDirty: boolean;
  alertRulesJson: string;
  alertRulesIoSummary: string;
  alertRuleOverridesCount: number;
  alertRuleDraftEffective: AlertRuleRow[];
  sourcesJson: string;
  sourcesIoLoading: boolean;
  sourcesIoSummary: string;
  specsJson: string;
  specsIoLoading: boolean;
  specsIoSummary: string;
  handleAlertRulesAction: (action: "reload" | "apply") => Promise<void>;
  setAlertRulesJson: (value: string) => void;
  setSourcesJson: (value: string) => void;
  setSpecsJson: (value: string) => void;
  handleIo: (target: "sources" | "specs", action: "export" | "import", mode?: "dry_run" | "apply") => Promise<void>;
};

export type NewsSettingsController = {
  hero: NewsSettingsHeroState;
  exposure: NewsSettingsExposureState;
  sources: NewsSettingsSourcesState;
  topics: NewsSettingsTopicsState;
  advanced: NewsSettingsAdvancedState;
  actions: {
    handleSave: () => Promise<void>;
  };
};

export type NewsSettingsSectionProps<T> = HTMLAttributes<HTMLElement> & {
  state: T;
};

export function buildSourceDrafts(rows: SourceRow[]): Record<string, SourceDraft> {
  return Object.fromEntries(rows.map((row) => [
    row.id,
    {
      id: row.id,
      enabled: row.overrideEnabled ?? row.defaultEnabled,
      weight: String(row.overrideWeight ?? row.defaultWeight),
    },
  ]));
}

export function buildTopicDrafts(rows: TopicRow[]): Record<string, TopicDraft> {
  return Object.fromEntries(rows.map((row) => [
    row.id,
    {
      id: row.id,
      keywordsText: keywordsToTextarea(row.overrideKeywords),
    },
  ]));
}

export function normalizeWeightInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? String(parsed) : trimmed;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function formatDateTime(value: string | null | undefined): string {
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

export function formatAlertRuleKind(value: AlertRuleKind | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "topic_burst") return "토픽 급증";
  if (normalized === "indicator") return "지표 변화";
  return "-";
}

export function formatAlertRuleMetric(value: AlertRuleMetric | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "pctchange") return "변화율";
  if (normalized === "zscore") return "표준점수";
  if (normalized === "regime") return "추세";
  return "-";
}

export function formatAlertRuleCondition(value: AlertRuleCondition | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "up") return "상승";
  if (normalized === "down") return "하락";
  if (normalized === "high") return "고점권";
  if (normalized === "low") return "저점권";
  if (normalized === "flat") return "횡보";
  if (normalized === "unknown") return "데이터 부족";
  return "-";
}

export function formatAlertRuleLevel(value: AlertRuleLevel | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high") return "높음";
  if (normalized === "medium") return "중간";
  if (normalized === "low") return "낮음";
  return "-";
}

export function formatAlertRuleTargetType(value: AlertRuleTargetType | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "topic") return "토픽";
  if (normalized === "item") return "기사";
  if (normalized === "scenario") return "시나리오";
  if (normalized === "series") return "지표";
  return "-";
}

export function sortAlertRules(rows: AlertRuleRow[]): AlertRuleRow[] {
  return [...rows].sort((a, b) => {
    const kind = formatAlertRuleKind(a.kind).localeCompare(formatAlertRuleKind(b.kind));
    if (kind !== 0) return kind;
    const name = asString(a.name).localeCompare(asString(b.name));
    if (name !== 0) return name;
    return asString(a.id).localeCompare(asString(b.id));
  });
}

export function formatAlertRuleSummary(rule: AlertRuleRow): string {
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

export function normalizeAlertRuleOverride(value: unknown): AlertRuleOverride | null {
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

export function parseKeywords(text: string): string[] {
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

export function keywordsToTextarea(value: string[] | null | undefined): string {
  if (!Array.isArray(value) || value.length < 1) return "";
  return value.join("\n");
}

export function emptyExposureDraft(): ExposureDraft {
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

export function profileToDraft(profile: ExposureProfile | null | undefined): ExposureDraft {
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

export function draftToProfile(draft: ExposureDraft): Omit<ExposureProfile, "savedAt"> {
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

export function countKnownExposureFields(draft: ExposureDraft): number {
  return Object.values(draft).filter((value) => value !== "unknown").length;
}
