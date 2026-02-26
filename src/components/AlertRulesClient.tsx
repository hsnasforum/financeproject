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
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">프리셋</h2>
        <p className="mt-1 text-xs text-slate-500">필터/규칙을 preset 단위로 저장하고 전환합니다.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-[240px_1fr_auto_auto]">
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
            value={activePreset.id}
            onChange={(event) => persistProfile({ ...profile, activePresetId: event.target.value })}
          >
            {profile.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name} ({preset.id})</option>
            ))}
          </select>
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
            placeholder="새 프리셋 이름"
            value={newPresetName}
            onChange={(event) => setNewPresetName(event.target.value)}
          />
          <button
            type="button"
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800"
            onClick={onCreatePreset}
          >
            생성
          </button>
          <button
            type="button"
            className="h-10 rounded-lg bg-rose-50 px-4 text-sm font-bold text-rose-700 hover:bg-rose-100"
            onClick={onDeletePreset}
          >
            삭제
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
            onClick={onExportJson}
          >
            JSON 내보내기
          </button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">필터 설정</h2>
        <p className="mt-1 text-xs text-slate-500">active preset의 preferences를 수정합니다.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          <input
            type="number"
            min={0}
            max={100}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
            value={preferences.minScore}
            onChange={(event) => updateActivePreferences({ minScore: asNumber(event.target.value, 0) })}
            aria-label="minScore"
          />
          <input
            type="number"
            min={1}
            max={20}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
            value={preferences.maxPerCorp}
            onChange={(event) => updateActivePreferences({ maxPerCorp: asNumber(event.target.value, 2) })}
            aria-label="maxPerCorp"
          />
          <input
            type="number"
            min={1}
            max={200}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
            value={preferences.maxItems}
            onChange={(event) => updateActivePreferences({ maxItems: asNumber(event.target.value, 20) })}
            aria-label="maxItems"
          />
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 md:col-span-2"
            placeholder="includeCategories (comma)"
            value={includeCategoriesText}
            onChange={(event) => setIncludeCategoriesText(event.target.value)}
            onBlur={() => updateActivePreferences({ includeCategories: parseCsv(includeCategoriesText) })}
          />
        </div>
        <input
          className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
          placeholder="excludeFlags (comma)"
          value={excludeFlagsText}
          onChange={(event) => setExcludeFlagsText(event.target.value)}
          onBlur={() => updateActivePreferences({ excludeFlags: parseCsv(excludeFlagsText) })}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">규칙 추가</h2>
        <p className="mt-1 text-xs text-slate-500">회사/카테고리/키워드/클러스터 단위 무시 규칙을 추가합니다.</p>
        <div className={`mt-3 grid gap-2 ${kind === "keyword" ? "md:grid-cols-[180px_160px_1fr_auto]" : "md:grid-cols-[180px_1fr_auto]"}`}>
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
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
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
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
            className={`h-10 rounded-lg px-4 text-sm font-bold text-white ${canSaveRule ? "bg-slate-900 hover:bg-slate-800" : "cursor-not-allowed bg-slate-300"}`}
            onClick={onAddRule}
            disabled={!canSaveRule}
          >
            규칙 추가
          </button>
        </div>
        {kind === "keyword" && keywordMatch === "regex" && validationError ? (
          <p className="mt-2 text-xs text-rose-700">{validationError}</p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
        <p className="mt-2 text-xs text-slate-600">
          미리보기: 현재 샘플 {sampleItems.length}건 중 추가로 {previewHiddenCount}건 숨김 예상
          (현재 필터/규칙 적용 후 표시 {filteredCurrent.length}건)
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">규칙 목록</h2>
          <p className="text-xs text-slate-500">{rules.length}개</p>
        </div>
        {rules.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">등록된 규칙이 없습니다.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-2 py-1">종류</th>
                  <th className="px-2 py-1">매치</th>
                  <th className="px-2 py-1">값</th>
                  <th className="px-2 py-1">생성일</th>
                  <th className="px-2 py-1">활성</th>
                  <th className="px-2 py-1">삭제</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-semibold text-slate-900">{KIND_LABEL[rule.kind]}</td>
                    <td className="px-2 py-2">{rule.kind === "keyword" ? MATCH_LABEL[rule.match ?? "contains"] : "-"}</td>
                    <td className="px-2 py-2 font-mono text-[11px]">{rule.value}</td>
                    <td className="px-2 py-2">{formatDateTime(rule.createdAt)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className={`rounded-md px-2 py-1 text-[11px] font-bold ${rule.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                        onClick={() => updateActivePreset((preset) => ({ ...preset, rules: toggleRule(preset.rules, rule.id) }))}
                      >
                        {rule.enabled ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="rounded-md bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
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
      </section>
    </div>
  );
}
