import { defaultAlertPrefs, mergePrefs, type AlertPreferences } from "./alertPreferences";
import type { AlertKeywordMatch, AlertRule, AlertRuleKind } from "./alertRulesStore";
import { validateRegexPattern } from "./ruleRegexGuard";

export const ALERT_PROFILE_VERSION = 1;
export const ALERT_PROFILE_STORAGE_KEY = "dart_alert_profile_v1";
export const ALERT_PROFILE_CHANGED_EVENT = "dart-alert-profile-changed";

export type AlertProfilePreset = {
  id: string;
  name: string;
  preferences: AlertPreferences;
  rules: AlertRule[];
};

export type AlertProfile = {
  version: number;
  activePresetId: string;
  presets: AlertProfilePreset[];
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

function toKeywordMatch(value: unknown): AlertKeywordMatch {
  if (value === "contains" || value === "startsWith" || value === "regex") return value;
  return "contains";
}

function isRuleKind(value: unknown): value is AlertRuleKind {
  return value === "cluster" || value === "corp" || value === "category" || value === "keyword";
}

function parseRule(raw: unknown, presetId: string, index: number): AlertRule {
  if (!isRecord(raw)) {
    throw new Error(`invalid_rule:${presetId}:${index}`);
  }
  const kind = raw.kind;
  const value = asString(raw.value);
  if (!isRuleKind(kind) || !value) {
    throw new Error(`invalid_rule_shape:${presetId}:${index}`);
  }
  const match = kind === "keyword" ? toKeywordMatch(raw.match) : undefined;
  if (kind === "keyword" && match === "regex") {
    const validation = validateRegexPattern(value);
    if (!validation.ok) {
      throw new Error(`invalid_rule_regex:${presetId}:${index}:${validation.reason ?? "unknown"}`);
    }
  }
  return {
    id: asString(raw.id) || `${presetId}-rule-${index + 1}`,
    kind,
    value,
    match,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    createdAt: asString(raw.createdAt) || nowIso(),
  };
}

function parsePreset(raw: unknown, index: number): AlertProfilePreset {
  if (!isRecord(raw)) throw new Error(`invalid_preset:${index}`);
  const id = asString(raw.id);
  if (!id) throw new Error(`invalid_preset_id:${index}`);
  const name = asString(raw.name) || id;
  const preferencesRaw = isRecord(raw.preferences) ? raw.preferences : {};
  const preferences = mergePrefs(defaultAlertPrefs(), preferencesRaw as Partial<AlertPreferences>);
  const rulesRaw = Array.isArray(raw.rules) ? raw.rules : [];
  const rules = rulesRaw.map((rule, ruleIndex) => parseRule(rule, id, ruleIndex));
  return {
    id,
    name,
    preferences,
    rules,
  };
}

export function parseAlertProfile(raw: unknown): AlertProfile {
  if (!isRecord(raw)) throw new Error("invalid_profile_root");
  const presetsRaw = Array.isArray(raw.presets) ? raw.presets : [];
  if (presetsRaw.length === 0) throw new Error("invalid_profile_presets_empty");
  const presets = presetsRaw.map((preset, index) => parsePreset(preset, index));
  const seen = new Set<string>();
  for (const preset of presets) {
    if (seen.has(preset.id)) throw new Error(`duplicate_preset_id:${preset.id}`);
    seen.add(preset.id);
  }
  return {
    version: Number.isInteger(raw.version) ? Number(raw.version) : ALERT_PROFILE_VERSION,
    activePresetId: asString(raw.activePresetId),
    presets,
  };
}

export function getActivePreset(profile: AlertProfile): AlertProfilePreset {
  const picked = profile.presets.find((preset) => preset.id === profile.activePresetId);
  return picked ?? profile.presets[0]!;
}

export function toProfileJson(
  presets: AlertProfilePreset[],
  activePresetId: string,
): AlertProfile {
  return parseAlertProfile({
    version: ALERT_PROFILE_VERSION,
    activePresetId,
    presets,
  });
}

export function defaultAlertProfile(): AlertProfile {
  return {
    version: ALERT_PROFILE_VERSION,
    activePresetId: "default",
    presets: [
      {
        id: "default",
        name: "Default",
        preferences: defaultAlertPrefs(),
        rules: [],
      },
    ],
  };
}
