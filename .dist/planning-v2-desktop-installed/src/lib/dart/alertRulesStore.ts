import { validateRegexPattern } from "./ruleRegexGuard";

export const ALERT_RULES_STORAGE_KEY = "dart_alert_rules_v1";
export const ALERT_RULES_CHANGED_EVENT = "dart-alert-rules-changed";

export type AlertRuleKind = "cluster" | "corp" | "category" | "keyword";
export type AlertKeywordMatch = "contains" | "startsWith" | "regex";

export type AlertRule = {
  id: string;
  kind: AlertRuleKind;
  value: string;
  match?: AlertKeywordMatch;
  enabled: boolean;
  createdAt: string;
};

export type AlertRuleMatchItem = {
  id?: string;
  clusterKey?: string;
  corpCode?: string;
  categoryId?: string;
  title?: string;
  normalizedTitle?: string;
  [key: string]: unknown;
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isRuleKind(value: unknown): value is AlertRuleKind {
  return value === "cluster" || value === "corp" || value === "category" || value === "keyword";
}

function normalizeKeywordMatch(value: unknown): AlertKeywordMatch {
  if (value === "contains" || value === "startsWith" || value === "regex") return value;
  return "contains";
}

function normalizeRule(raw: unknown): AlertRule | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id) || genId();
  const kind = raw.kind;
  const value = asString(raw.value);
  const match = normalizeKeywordMatch(raw.match);
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
  const createdAt = asString(raw.createdAt) || nowIso();
  if (!id || !isRuleKind(kind) || !value) return null;
  if (kind === "keyword" && match === "regex" && !validateRegexPattern(value).ok) return null;
  return {
    id,
    kind,
    value,
    match: kind === "keyword" ? match : undefined,
    enabled,
    createdAt,
  };
}

function compareRules(a: AlertRule, b: AlertRule): number {
  const createdDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
  const matchA = a.kind === "keyword" ? normalizeKeywordMatch(a.match) : "";
  const matchB = b.kind === "keyword" ? normalizeKeywordMatch(b.match) : "";
  if (matchA !== matchB) return matchA.localeCompare(matchB);
  if (a.value !== b.value) return a.value.localeCompare(b.value);
  return a.id.localeCompare(b.id);
}

function normalizeRules(raw: unknown): AlertRule[] {
  if (!Array.isArray(raw)) return [];
  const dedup = new Map<string, AlertRule>();
  for (const row of raw) {
    const rule = normalizeRule(row);
    if (!rule) continue;
    const dedupKey = `${rule.kind}::${rule.kind === "keyword" ? normalizeKeywordMatch(rule.match) : ""}::${rule.value.toLowerCase()}`;
    if (!dedup.has(dedupKey)) {
      dedup.set(dedupKey, rule);
      continue;
    }
    const existing = dedup.get(dedupKey);
    if (!existing) continue;
    if (Date.parse(rule.createdAt) > Date.parse(existing.createdAt)) {
      dedup.set(dedupKey, rule);
    }
  }
  return [...dedup.values()].sort(compareRules);
}

function storageRef(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

export function loadRules(storageKey = ALERT_RULES_STORAGE_KEY): AlertRule[] {
  const storage = storageRef();
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    return normalizeRules(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function saveRules(rules: AlertRule[], storageKey = ALERT_RULES_STORAGE_KEY): AlertRule[] {
  const normalized = normalizeRules(rules);
  const storage = storageRef();
  if (storage) {
    try {
      storage.setItem(storageKey, JSON.stringify(normalized));
    } catch {
      // no-op
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ALERT_RULES_CHANGED_EVENT));
  }
  return normalized;
}

export function addRule(
  rules: AlertRule[],
  input: { kind: AlertRuleKind; value: string; enabled?: boolean; match?: AlertKeywordMatch },
): AlertRule[] {
  const kind = input.kind;
  const value = asString(input.value);
  const match = normalizeKeywordMatch(input.match);
  if (!isRuleKind(kind) || !value) return normalizeRules(rules);
  if (kind === "keyword" && match === "regex" && !validateRegexPattern(value).ok) return normalizeRules(rules);
  const exists = normalizeRules(rules).some(
    (rule) =>
      rule.kind === kind
      && rule.value.toLowerCase() === value.toLowerCase()
      && (kind !== "keyword" || normalizeKeywordMatch(rule.match) === match),
  );
  if (exists) return normalizeRules(rules);
  return normalizeRules([
    ...rules,
    {
      id: genId(),
      kind,
      value,
      match: kind === "keyword" ? match : undefined,
      enabled: input.enabled ?? true,
      createdAt: nowIso(),
    },
  ]);
}

export function removeRule(rules: AlertRule[], id: string): AlertRule[] {
  const target = asString(id);
  if (!target) return normalizeRules(rules);
  return normalizeRules(rules.filter((rule) => rule.id !== target));
}

export function toggleRule(rules: AlertRule[], id: string): AlertRule[] {
  const target = asString(id);
  if (!target) return normalizeRules(rules);
  return normalizeRules(rules.map((rule) => (rule.id === target ? { ...rule, enabled: !rule.enabled } : rule)));
}

function matchesRule(item: AlertRuleMatchItem, rule: AlertRule): boolean {
  if (!rule.enabled) return false;
  if (rule.kind === "cluster") {
    return asString(item.clusterKey) === rule.value;
  }
  if (rule.kind === "corp") {
    return asString(item.corpCode) === rule.value;
  }
  if (rule.kind === "category") {
    return asString(item.categoryId) === rule.value;
  }
  const haystack = asString(item.normalizedTitle || item.title);
  const match = normalizeKeywordMatch(rule.match);
  if (match === "startsWith") {
    return haystack.toLowerCase().startsWith(rule.value.toLowerCase());
  }
  if (match === "regex") {
    const validation = validateRegexPattern(rule.value);
    if (!validation.ok) return false;
    try {
      return new RegExp(rule.value).test(haystack);
    } catch {
      return false;
    }
  }
  return haystack.toLowerCase().includes(rule.value.toLowerCase());
}

export function applyRules<T extends AlertRuleMatchItem>(items: T[], rules: AlertRule[]): T[] {
  const normalizedRules = normalizeRules(rules).filter((rule) => rule.enabled);
  if (normalizedRules.length === 0) return [...items];
  return items.filter((item) => !normalizedRules.some((rule) => matchesRule(item, rule)));
}
