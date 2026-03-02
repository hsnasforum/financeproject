export type AlertPreferences = {
  minScore: number;
  includeCategories: string[];
  excludeFlags: string[];
  maxPerCorp: number;
  maxItems: number;
};

export type AlertPreferenceItem = {
  corpName: string;
  categoryLabel: string;
  title: string;
  rceptNo: string;
  clusterScore: number;
};

export type AlertBuckets = {
  generatedAt: string | null;
  newHigh: AlertPreferenceItem[];
  newMid: AlertPreferenceItem[];
  updatedHigh: AlertPreferenceItem[];
  updatedMid: AlertPreferenceItem[];
};

const DEFAULT_PREFS: AlertPreferences = {
  minScore: 70,
  includeCategories: [],
  excludeFlags: ["정정", "첨부", "공시서류제출", "연결"],
  maxPerCorp: 2,
  maxItems: 20,
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const row of value) {
    const text = asString(row);
    if (text) out.add(text);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizePrefs(raw: unknown, fallback: AlertPreferences = DEFAULT_PREFS): AlertPreferences {
  const row = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    minScore: Math.max(0, Math.min(100, asNumber(row.minScore, fallback.minScore))),
    includeCategories: normalizeStringArray(row.includeCategories),
    excludeFlags: normalizeStringArray(row.excludeFlags),
    maxPerCorp: Math.max(1, Math.min(20, Math.round(asNumber(row.maxPerCorp, fallback.maxPerCorp)))),
    maxItems: Math.max(1, Math.min(200, Math.round(asNumber(row.maxItems, fallback.maxItems)))),
  };
}

export function defaultAlertPrefs(): AlertPreferences {
  return { ...DEFAULT_PREFS };
}

export function loadUserPrefs(storageKey = "dart_alert_prefs_v1"): Partial<AlertPreferences> | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    return {
      minScore: asNumber(row.minScore, DEFAULT_PREFS.minScore),
      includeCategories: normalizeStringArray(row.includeCategories),
      excludeFlags: normalizeStringArray(row.excludeFlags),
      maxPerCorp: Math.max(1, Math.round(asNumber(row.maxPerCorp, DEFAULT_PREFS.maxPerCorp))),
      maxItems: Math.max(1, Math.round(asNumber(row.maxItems, DEFAULT_PREFS.maxItems))),
    };
  } catch {
    return null;
  }
}

export function mergePrefs(
  base: AlertPreferences,
  override?: Partial<AlertPreferences> | null,
): AlertPreferences {
  return normalizePrefs({ ...base, ...(override ?? {}) }, base);
}

function containsAnyFlag(title: string, flags: string[]): boolean {
  if (flags.length === 0) return false;
  const text = title.toLowerCase();
  return flags.some((flag) => text.includes(flag.toLowerCase()));
}

function compareItem(a: AlertPreferenceItem, b: AlertPreferenceItem): number {
  if (a.clusterScore !== b.clusterScore) return b.clusterScore - a.clusterScore;
  const corpA = asString(a.corpName);
  const corpB = asString(b.corpName);
  if (corpA !== corpB) return corpA.localeCompare(corpB);
  const titleA = asString(a.title);
  const titleB = asString(b.title);
  if (titleA !== titleB) return titleA.localeCompare(titleB);
  const categoryA = asString(a.categoryLabel);
  const categoryB = asString(b.categoryLabel);
  if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);
  return asString(a.rceptNo).localeCompare(asString(b.rceptNo));
}

function sortedAndFiltered(items: AlertPreferenceItem[], prefs: AlertPreferences): AlertPreferenceItem[] {
  const includeSet = new Set(prefs.includeCategories.map((value) => value.toLowerCase()));
  const filtered = [...items]
    .filter((item) => item.clusterScore >= prefs.minScore)
    .filter((item) => includeSet.size === 0 || includeSet.has(asString(item.categoryLabel).toLowerCase()))
    .filter((item) => !containsAnyFlag(asString(item.title), prefs.excludeFlags))
    .sort(compareItem);

  const perCorpCount = new Map<string, number>();
  const perCorpLimited: AlertPreferenceItem[] = [];
  for (const item of filtered) {
    const key = asString(item.corpName) || "-";
    const count = perCorpCount.get(key) ?? 0;
    if (count >= prefs.maxPerCorp) continue;
    perCorpCount.set(key, count + 1);
    perCorpLimited.push(item);
  }
  return perCorpLimited.slice(0, prefs.maxItems);
}

export function applyPrefsToAlerts(alerts: AlertBuckets, prefs: AlertPreferences): AlertBuckets {
  type Bucket = "newHigh" | "newMid" | "updatedHigh" | "updatedMid";
  const tagged: Array<{ bucket: Bucket; item: AlertPreferenceItem }> = [];
  for (const bucket of ["newHigh", "newMid", "updatedHigh", "updatedMid"] as const) {
    for (const item of alerts[bucket] ?? []) {
      tagged.push({ bucket, item });
    }
  }

  const limited = sortedAndFiltered(tagged.map((row) => row.item), prefs);
  const allowed = new Set(limited.map((item) => `${asString(item.corpName)}|${asString(item.title)}|${asString(item.rceptNo)}|${item.clusterScore}`));

  const next: AlertBuckets = {
    generatedAt: alerts.generatedAt ?? null,
    newHigh: [],
    newMid: [],
    updatedHigh: [],
    updatedMid: [],
  };

  for (const row of tagged) {
    const key = `${asString(row.item.corpName)}|${asString(row.item.title)}|${asString(row.item.rceptNo)}|${row.item.clusterScore}`;
    if (!allowed.has(key)) continue;
    next[row.bucket].push(row.item);
    allowed.delete(key);
  }

  for (const bucket of ["newHigh", "newMid", "updatedHigh", "updatedMid"] as const) {
    next[bucket] = [...next[bucket]].sort(compareItem);
  }

  return next;
}
