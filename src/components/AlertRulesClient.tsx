"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultAlertPrefs, mergePrefs, loadUserPrefs, type AlertPreferences } from "@/lib/dart/alertPreferences";
import {
  ALERT_PROFILE_CHANGED_EVENT,
  ALERT_PROFILE_STORAGE_KEY,
  defaultAlertProfile,
  getActivePreset,
  parseAlertProfile,
  toProfileJson,
  type AlertProfile,
  type AlertProfilePreset,
} from "@/lib/dart/alertProfile";
import {
  ALERT_RULES_CHANGED_EVENT,
  ALERT_RULES_STORAGE_KEY,
  addRule,
  applyRules,
  loadRules,
  saveRules,
  toggleRule,
  removeRule,
  type AlertKeywordMatch,
  type AlertRuleKind,
} from "@/lib/dart/alertRulesStore";
import { validateRegexPattern, type RegexValidationResult } from "@/lib/dart/ruleRegexGuard";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";

const ALERT_PREFS_STORAGE_KEY = "dart_alert_prefs_v1";
const ALERT_PREFS_CHANGED_EVENT = "dart-alert-prefs-changed";

type AlertItem = {
  clusterKey?: string;
  corpCode?: string;
  corpName?: string;
  categoryId?: string;
  categoryLabel?: string;
  title?: string;
  normalizedTitle?: string;
  clusterScore?: number;
  date?: string | null;
};

type AlertsData = {
  newHigh?: AlertItem[];
  newMid?: AlertItem[];
  updatedHigh?: AlertItem[];
  updatedMid?: AlertItem[];
};

type AlertsApiPayload = {
  ok?: boolean;
  data?: AlertsData;
};

const KIND_LABEL: Record<AlertRuleKind, string> = {
  cluster: "클러스터",
  corp: "회사",
  category: "카테고리",
  keyword: "키워드",
};

const MATCH_LABEL: Record<AlertKeywordMatch, string> = {
  contains: "contains",
  startsWith: "startsWith",
  regex: "regex",
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseCsv(value: string): string[] {
  const values = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function toCsv(value: string[]): string {
  return value.join(", ");
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

function toDateMillis(value: unknown): number {
  const text = asString(value);
  if (!text) return 0;
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const parsed = Date.UTC(year, month, day);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareAlertItem(a: AlertItem, b: AlertItem): number {
  const scoreDiff = asNumber(b.clusterScore, 0) - asNumber(a.clusterScore, 0);
  if (scoreDiff !== 0) return scoreDiff;
  const dateDiff = toDateMillis(b.date) - toDateMillis(a.date);
  if (dateDiff !== 0) return dateDiff;
  const corpA = asString(a.corpName);
  const corpB = asString(b.corpName);
  if (corpA !== corpB) return corpA.localeCompare(corpB);
  const titleA = asString(a.title);
  const titleB = asString(b.title);
  if (titleA !== titleB) return titleA.localeCompare(titleB);
  return asString(a.clusterKey).localeCompare(asString(b.clusterKey));
}

function applyPreferencesToItems(items: AlertItem[], prefs: AlertPreferences): AlertItem[] {
  const includeSet = new Set((prefs.includeCategories ?? []).map((value) => asString(value).toLowerCase()).filter(Boolean));
  const excludedFlags = (prefs.excludeFlags ?? []).map((flag) => asString(flag).toLowerCase()).filter(Boolean);
  const filtered = [...items]
    .filter((item) => asNumber(item.clusterScore, 0) >= prefs.minScore)
    .filter((item) => includeSet.size === 0 || includeSet.has(asString(item.categoryLabel).toLowerCase()))
    .filter((item) => {
      if (excludedFlags.length === 0) return true;
      const text = asString(item.title).toLowerCase();
      return !excludedFlags.some((flag) => text.includes(flag));
    })
    .sort(compareAlertItem);

  const perCorp = new Map<string, number>();
  const limited: AlertItem[] = [];
  for (const item of filtered) {
    const corp = asString(item.corpName) || "-";
    const count = perCorp.get(corp) ?? 0;
    if (count >= prefs.maxPerCorp) continue;
    perCorp.set(corp, count + 1);
    limited.push(item);
    if (limited.length >= prefs.maxItems) break;
  }
  return limited;
}

function uniquePresetId(baseName: string, presets: AlertProfilePreset[]): string {
  const base = asString(baseName)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "preset";
  let candidate = base;
  let seq = 2;
  const used = new Set(presets.map((preset) => preset.id));
  while (used.has(candidate)) {
    candidate = `${base}-${seq}`;
    seq += 1;
  }
  return candidate;
}

function bootstrapProfileFromLegacy(): AlertProfile {
  const fallback = defaultAlertProfile();
  const legacyPrefs = mergePrefs(defaultAlertPrefs(), loadUserPrefs(ALERT_PREFS_STORAGE_KEY));
  const legacyRules = loadRules();
  const preset = getActivePreset(fallback);
  preset.preferences = legacyPrefs;
  preset.rules = legacyRules;
  return fallback;
}

function loadProfileFromStorage(): AlertProfile {
  if (typeof window === "undefined" || !window.localStorage) return bootstrapProfileFromLegacy();
  const raw = window.localStorage.getItem(ALERT_PROFILE_STORAGE_KEY);
  if (!raw) return bootstrapProfileFromLegacy();
  try {
    return parseAlertProfile(JSON.parse(raw) as unknown);
  } catch {
    return bootstrapProfileFromLegacy();
  }
}

export function AlertRulesClient() {
  const [profile, setProfile] = useState<AlertProfile>(defaultAlertProfile());
  const [kind, setKind] = useState<AlertRuleKind>("corp");
  const [keywordMatch, setKeywordMatch] = useState<AlertKeywordMatch>("contains");
  const [ruleValue, setRuleValue] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [includeCategoriesText, setIncludeCategoriesText] = useState("");
  const [excludeFlagsText, setExcludeFlagsText] = useState("");
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [error, setError] = useState("");

  const activePreset = useMemo(() => getActivePreset(profile), [profile]);
  const rules = activePreset.rules;
  const preferences = activePreset.preferences;

  useEffect(() => {
    setIncludeCategoriesText(toCsv(preferences.includeCategories));
    setExcludeFlagsText(toCsv(preferences.excludeFlags));
  }, [preferences.excludeFlags, preferences.includeCategories, profile.activePresetId]);

  useEffect(() => {
    setProfile(loadProfileFromStorage());
    const onProfileChanged = () => setProfile(loadProfileFromStorage());
    const onRulesChanged = () => setProfile(loadProfileFromStorage());
    const onStorage = (event: StorageEvent) => {
      if (!event.key) {
        setProfile(loadProfileFromStorage());
        return;
      }
      if (event.key === ALERT_PROFILE_STORAGE_KEY || event.key === ALERT_RULES_STORAGE_KEY || event.key === ALERT_PREFS_STORAGE_KEY) {
        setProfile(loadProfileFromStorage());
      }
    };
    window.addEventListener(ALERT_PROFILE_CHANGED_EVENT, onProfileChanged);
    window.addEventListener(ALERT_RULES_CHANGED_EVENT, onRulesChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ALERT_PROFILE_CHANGED_EVENT, onProfileChanged);
      window.removeEventListener(ALERT_RULES_CHANGED_EVENT, onRulesChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const response = await fetch("/api/dev/dart/alerts", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as AlertsApiPayload;
        if (!active) return;
        setAlertsData(payload.data ?? {});
      } catch {
        if (!active) return;
        setAlertsData({});
      }
    }
    void run();
    return () => {
      active = false;
    };
  }, []);

  const sampleItems = useMemo(() => {
    return [
      ...(alertsData?.newHigh ?? []),
      ...(alertsData?.newMid ?? []),
      ...(alertsData?.updatedHigh ?? []),
      ...(alertsData?.updatedMid ?? []),
    ];
  }, [alertsData]);

  const corpOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of sampleItems) {
      const code = asString(item.corpCode);
      if (!code) continue;
      map.set(code, asString(item.corpName) || code);
    }
    return [...map.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sampleItems]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of sampleItems) {
      const id = asString(item.categoryId);
      if (!id) continue;
      map.set(id, asString(item.categoryLabel) || id);
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sampleItems]);

  const trimmedRuleValue = asString(ruleValue);
  const regexValidation = useMemo<RegexValidationResult>(() => {
    if (kind !== "keyword" || keywordMatch !== "regex") return { ok: true };
    return validateRegexPattern(trimmedRuleValue);
  }, [kind, keywordMatch, trimmedRuleValue]);

  const validationError = useMemo(() => {
    if (!trimmedRuleValue) return "규칙 값을 입력하세요.";
    if (kind === "keyword" && keywordMatch === "regex" && !regexValidation.ok) {
      if (regexValidation.reason === "pattern_too_long") return "regex 길이는 80자 이하여야 합니다.";
      if (regexValidation.reason === "nested_repeat_risk") return "중첩 반복 위험 패턴은 허용되지 않습니다.";
      if (regexValidation.reason === "invalid_regex") return "유효하지 않은 regex 패턴입니다.";
      return "regex 패턴 검증에 실패했습니다.";
    }
    return "";
  }, [kind, keywordMatch, regexValidation.ok, regexValidation.reason, trimmedRuleValue]);

  const canSaveRule = validationError.length === 0;

  function syncLegacy(active: AlertProfilePreset): void {
    saveRules(active.rules);
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(ALERT_PREFS_STORAGE_KEY, JSON.stringify(active.preferences));
    window.dispatchEvent(new CustomEvent(ALERT_PREFS_CHANGED_EVENT));
  }

  function persistProfile(next: AlertProfile): void {
    const normalized = toProfileJson(next.presets, next.activePresetId);
    const active = getActivePreset(normalized);
    syncLegacy(active);
    setProfile(normalized);
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(ALERT_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent(ALERT_PROFILE_CHANGED_EVENT));
    }
  }

  function updateActivePreset(
    updater: (preset: AlertProfilePreset) => AlertProfilePreset,
  ): void {
    const updatedPresets = profile.presets.map((preset) =>
      preset.id === activePreset.id ? updater(preset) : preset,
    );
    persistProfile({
      ...profile,
      presets: updatedPresets,
    });
  }

  const filteredCurrent = useMemo(() => {
    const prefsFiltered = applyPreferencesToItems(sampleItems, preferences);
    return applyRules(prefsFiltered, rules);
  }, [preferences, rules, sampleItems]);

  const previewRules = useMemo(() => {
    if (!canSaveRule) return rules;
    return addRule(rules, {
      kind,
      value: trimmedRuleValue,
      match: kind === "keyword" ? keywordMatch : undefined,
    });
  }, [canSaveRule, kind, keywordMatch, rules, trimmedRuleValue]);

  const previewHiddenCount = useMemo(() => {
    const prefsFiltered = applyPreferencesToItems(sampleItems, preferences);
    const preview = applyRules(prefsFiltered, previewRules);
    return Math.max(0, filteredCurrent.length - preview.length);
  }, [filteredCurrent.length, preferences, previewRules, sampleItems]);

  function onAddRule() {
    if (!canSaveRule) {
      setError(validationError);
      return;
    }
    const nextRules = addRule(rules, {
      kind,
      value: trimmedRuleValue,
      match: kind === "keyword" ? keywordMatch : undefined,
    });
    if (nextRules.length === rules.length) {
      setError("동일한 규칙이 이미 존재하거나 유효하지 않은 규칙입니다.");
      return;
    }
    updateActivePreset((preset) => ({ ...preset, rules: nextRules }));
    setRuleValue("");
    setKeywordMatch("contains");
    setError("");
  }

  function onCreatePreset() {
    const name = asString(newPresetName);
    if (!name) {
      setError("프리셋 이름을 입력하세요.");
      return;
    }
    const id = uniquePresetId(name, profile.presets);
    const nextPreset: AlertProfilePreset = {
      id,
      name,
      preferences: { ...activePreset.preferences },
      rules: activePreset.rules.map((rule) => ({ ...rule })),
    };
    persistProfile({
      ...profile,
      activePresetId: id,
      presets: [...profile.presets, nextPreset],
    });
    setNewPresetName("");
    setError("");
  }

  function onDeletePreset() {
    if (profile.presets.length <= 1) {
      setError("프리셋은 최소 1개가 필요합니다.");
      return;
    }
    const nextPresets = profile.presets.filter((preset) => preset.id !== activePreset.id);
    persistProfile({
      ...profile,
      presets: nextPresets,
      activePresetId: nextPresets[0]?.id ?? "",
    });
    setError("");
  }

  function onExportJson() {
    const json = JSON.stringify(profile, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dart-alert-profile.backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function onImportJson(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = asString(reader.result);
        if (!text) throw new Error("empty_file");
        const raw = JSON.parse(text) as unknown;
        const parsed = parseAlertProfile(raw);
        persistProfile(parsed);
        setError("");
      } catch {
        setError("JSON 가져오기에 실패했습니다. 파일 형식을 확인하세요.");
      }
    };
    reader.readAsText(file);
  }

  function updateActivePreferences(next: Partial<AlertPreferences>) {
    updateActivePreset((preset) => ({
      ...preset,
      preferences: mergePrefs(preset.preferences, next),
    }));
  }

  function renderRuleValueInput() {
    if (kind === "corp") {
      return (
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
          value={ruleValue}
          onChange={(event) => setRuleValue(event.target.value)}
        >
          <option value="">회사 선택</option>
          {corpOptions.map((item) => (
            <option key={item.code} value={item.code}>{item.name} ({item.code})</option>
          ))}
        </select>
      );
    }
    if (kind === "category") {
      return (
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
          value={ruleValue}
          onChange={(event) => setRuleValue(event.target.value)}
        >
          <option value="">카테고리 선택</option>
          {categoryOptions.map((item) => (
            <option key={item.id} value={item.id}>{item.label} ({item.id})</option>
          ))}
        </select>
      );
    }
    return (
      <input
        className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
        placeholder={kind === "cluster" ? "clusterKey 입력" : "키워드 입력"}
        value={ruleValue}
        onChange={(event) => setRuleValue(event.target.value)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-[2rem] p-8 shadow-sm">
        <SubSectionHeader
          title="프리셋"
          description="필터/규칙을 preset 단위로 저장하고 전환합니다."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-[240px_1fr_auto_auto]">
          <select
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
            value={activePreset.id}
            onChange={(event) => persistProfile({ ...profile, activePresetId: event.target.value })}
          >
            {profile.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name} ({preset.id})</option>
            ))}
          </select>
          <input
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
            placeholder="새 프리셋 이름"
            value={newPresetName}
            onChange={(event) => setNewPresetName(event.target.value)}
          />
          <button
            type="button"
            className="h-11 rounded-2xl bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
            onClick={onCreatePreset}
          >
            생성
          </button>
          <button
            type="button"
            className="h-11 rounded-2xl bg-rose-50 px-6 text-sm font-black text-rose-700 hover:bg-rose-100 transition-colors shadow-sm"
            onClick={onDeletePreset}
          >
            삭제
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
            onClick={onExportJson}
          >
            JSON 내보내기
          </button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
            JSON 가져오기
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                onImportJson(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </Card>

      <Card className="rounded-[2rem] p-8 shadow-sm">
        <SubSectionHeader
          title="필터 설정"
          description="현재 프리셋의 상세 필터링 임계치를 설정합니다."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Min Score</label>
            <input
              type="number"
              min={0}
              max={100}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
              value={preferences.minScore}
              onChange={(event) => updateActivePreferences({ minScore: asNumber(event.target.value, 0) })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max Per Corp</label>
            <input
              type="number"
              min={1}
              max={20}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
              value={preferences.maxPerCorp}
              onChange={(event) => updateActivePreferences({ maxPerCorp: asNumber(event.target.value, 2) })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max Items</label>
            <input
              type="number"
              min={1}
              max={200}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none tabular-nums"
              value={preferences.maxItems}
              onChange={(event) => updateActivePreferences({ maxItems: asNumber(event.target.value, 20) })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Include Categories</label>
            <input
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
              placeholder="comma separated"
              value={includeCategoriesText}
              onChange={(event) => setIncludeCategoriesText(event.target.value)}
              onBlur={() => updateActivePreferences({ includeCategories: parseCsv(includeCategoriesText) })}
            />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Exclude Flags</label>
          <input
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
            placeholder="comma separated keywords to ignore"
            value={excludeFlagsText}
            onChange={(event) => setExcludeFlagsText(event.target.value)}
            onBlur={() => updateActivePreferences({ excludeFlags: parseCsv(excludeFlagsText) })}
          />
        </div>
      </Card>

      <Card className="rounded-[2rem] p-8 shadow-sm">
        <SubSectionHeader
          title="규칙 추가"
          description="회사/카테고리/키워드/클러스터 단위 무시 규칙을 정의합니다."
        />
        <div className={`mt-6 grid gap-4 ${kind === "keyword" ? "md:grid-cols-[180px_160px_1fr_auto]" : "md:grid-cols-[180px_1fr_auto]"}`}>
          <select
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as AlertRuleKind);
              setRuleValue("");
              setKeywordMatch("contains");
            }}
          >
            <option value="corp">회사</option>
            <option value="category">카테고리</option>
            <option value="keyword">키워드</option>
            <option value="cluster">클러스터</option>
          </select>
          {kind === "keyword" ? (
            <select
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
              value={keywordMatch}
              onChange={(event) => setKeywordMatch(event.target.value as AlertKeywordMatch)}
            >
              <option value="contains">contains</option>
              <option value="startsWith">startsWith</option>
              <option value="regex">regex</option>
            </select>
          ) : null}
          {renderRuleValueInput()}
          <button
            type="button"
            className={cn(
              "h-11 rounded-2xl px-6 text-sm font-black shadow-sm transition-all active:scale-95",
              canSaveRule
                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-900/20"
                : "cursor-not-allowed bg-slate-100 text-slate-400"
            )}
            onClick={onAddRule}
            disabled={!canSaveRule}
          >
            규칙 추가
          </button>
        </div>
        {kind === "keyword" && keywordMatch === "regex" && validationError ? (
          <p className="mt-2 text-xs font-bold text-rose-500">{validationError}</p>
        ) : null}
        {error ? <p className="mt-2 text-xs font-bold text-rose-500">{error}</p> : null}
        <p className="mt-4 text-[11px] font-bold text-slate-400 bg-slate-50 rounded-xl p-3">
          미리보기: 샘플 {sampleItems.length}건 중 <span className="text-emerald-600 font-black">{previewHiddenCount}건</span> 추가 제외 예상
          (현재 활성 규칙 기준 표시 {filteredCurrent.length}건)
        </p>
      </Card>

      <Card className="rounded-[2rem] p-8 shadow-sm">
        <SubSectionHeader
          title="규칙 목록"
          description={`${rules.length}개의 활성 규칙이 등록되어 있습니다.`}
        />
        {rules.length === 0 ? (
          <div className="py-12 text-center rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/50">
            <p className="text-sm font-black text-slate-400">등록된 무시 규칙이 없습니다.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-3 py-3">종류</th>
                  <th className="px-3 py-3">매치</th>
                  <th className="px-3 py-3">값</th>
                  <th className="px-3 py-3">생성일</th>
                  <th className="px-3 py-3 text-center">활성</th>
                  <th className="px-3 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rules.map((rule) => (
                  <tr key={rule.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-4 font-black text-slate-900">{KIND_LABEL[rule.kind]}</td>
                    <td className="px-3 py-4 font-bold text-slate-500">{rule.kind === "keyword" ? MATCH_LABEL[rule.match ?? "contains"] : "-"}</td>
                    <td className="px-3 py-4 font-mono text-[11px] font-bold text-slate-700">{rule.value}</td>
                    <td className="px-3 py-4 font-bold text-slate-400 text-xs">{formatDateTime(rule.createdAt)}</td>
                    <td className="px-3 py-4 text-center">
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 text-[10px] font-black shadow-sm transition-all ${rule.enabled ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}
                        onClick={() => updateActivePreset((preset) => ({ ...preset, rules: toggleRule(preset.rules, rule.id) }))}
                      >
                        {rule.enabled ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <button
                        type="button"
                        className="rounded-xl bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-700 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-100"
                        onClick={() => updateActivePreset((preset) => ({ ...preset, rules: removeRule(preset.rules, rule.id) }))}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
