import fs from "node:fs";
import path from "node:path";
import { defaultAlertPrefs, type AlertPreferences } from "./alertPreferences";

export type DisclosureAlertItem = {
  id: string;
  clusterKey: string;
  corpCode: string;
  corpName: string;
  categoryId: string;
  categoryLabel: string;
  title: string;
  normalizedTitle: string;
  rceptNo: string;
  date: string | null;
  clusterScore: number;
};

export type DisclosureAlertsData = {
  generatedAt: string | null;
  prefs: AlertPreferences;
  meta: {
    prefsPath: string | null;
    prefsLoadedFrom: string | null;
    rawCounts: {
      newHigh: number;
      newMid: number;
      updatedHigh: number;
      updatedMid: number;
      total: number;
    };
    filteredCounts: {
      newHigh: number;
      newMid: number;
      updatedHigh: number;
      updatedMid: number;
      total: number;
    };
  };
  newHigh: DisclosureAlertItem[];
  newMid: DisclosureAlertItem[];
  updatedHigh: DisclosureAlertItem[];
  updatedMid: DisclosureAlertItem[];
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<string>();
  for (const row of value) {
    const text = asString(row);
    if (!text) continue;
    set.add(text);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function emptyDisclosureAlertsData(): DisclosureAlertsData {
  return {
    generatedAt: null,
    prefs: defaultAlertPrefs(),
    meta: {
      prefsPath: null,
      prefsLoadedFrom: null,
      rawCounts: { newHigh: 0, newMid: 0, updatedHigh: 0, updatedMid: 0, total: 0 },
      filteredCounts: { newHigh: 0, newMid: 0, updatedHigh: 0, updatedMid: 0, total: 0 },
    },
    newHigh: [],
    newMid: [],
    updatedHigh: [],
    updatedMid: [],
  };
}

function normalizeAlertItem(raw: unknown): DisclosureAlertItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const corpName = asString(row.corpName) || "-";
  const categoryLabel = asString(row.categoryLabel) || "기타";
  const title = asString(row.title) || "(제목 없음)";
  const clusterKey = asString(row.clusterKey) || `${corpName}::${categoryLabel}::${title}`;
  const rceptNo = asString(row.rceptNo);
  const id = asString(row.id) || (rceptNo ? `${clusterKey}::${rceptNo}` : `${clusterKey}::item`);
  return {
    id,
    clusterKey,
    corpCode: asString(row.corpCode),
    corpName,
    categoryId: asString(row.categoryId),
    categoryLabel,
    title,
    normalizedTitle: asString(row.normalizedTitle) || title,
    rceptNo,
    date: asString(row.date) || null,
    clusterScore: asNumber(row.clusterScore, 0),
  };
}

function normalizeAlertList(raw: unknown): DisclosureAlertItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DisclosureAlertItem[] = [];
  for (const item of raw) {
    const normalized = normalizeAlertItem(item);
    if (!normalized) continue;
    out.push(normalized);
  }
  return out;
}

function normalizeAlerts(raw: unknown): DisclosureAlertsData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyDisclosureAlertsData();
  const row = raw as Record<string, unknown>;
  const defaults = emptyDisclosureAlertsData();
  const prefsRaw = row.prefs && typeof row.prefs === "object" && !Array.isArray(row.prefs)
    ? (row.prefs as Partial<AlertPreferences>)
    : {};
  const prefs = {
    minScore: Number.isFinite(Number(prefsRaw.minScore)) ? Number(prefsRaw.minScore) : defaults.prefs.minScore,
    includeCategories: normalizeStringArray(prefsRaw.includeCategories),
    excludeFlags: normalizeStringArray(prefsRaw.excludeFlags),
    maxPerCorp: Number.isFinite(Number(prefsRaw.maxPerCorp)) ? Number(prefsRaw.maxPerCorp) : defaults.prefs.maxPerCorp,
    maxItems: Number.isFinite(Number(prefsRaw.maxItems)) ? Number(prefsRaw.maxItems) : defaults.prefs.maxItems,
  };
  const normalizeCountRow = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults.meta.rawCounts;
    const countRow = value as Record<string, unknown>;
    return {
      newHigh: asNumber(countRow.newHigh, 0),
      newMid: asNumber(countRow.newMid, 0),
      updatedHigh: asNumber(countRow.updatedHigh, 0),
      updatedMid: asNumber(countRow.updatedMid, 0),
      total: asNumber(countRow.total, 0),
    };
  };
  const metaRaw = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
    ? (row.meta as Record<string, unknown>)
    : {};

  return {
    generatedAt: asString(row.generatedAt) || null,
    prefs: {
      minScore: Math.max(0, Math.min(100, asNumber(prefs.minScore, defaults.prefs.minScore))),
      includeCategories: [...new Set(prefs.includeCategories.map(asString).filter(Boolean))],
      excludeFlags: [...new Set(prefs.excludeFlags.map(asString).filter(Boolean))],
      maxPerCorp: Math.max(1, Math.round(asNumber(prefs.maxPerCorp, defaults.prefs.maxPerCorp))),
      maxItems: Math.max(1, Math.round(asNumber(prefs.maxItems, defaults.prefs.maxItems))),
    },
    meta: {
      prefsPath: asString(metaRaw.prefsPath) || null,
      prefsLoadedFrom: asString(metaRaw.prefsLoadedFrom) || null,
      rawCounts: normalizeCountRow(metaRaw.rawCounts),
      filteredCounts: normalizeCountRow(metaRaw.filteredCounts),
    },
    newHigh: normalizeAlertList(row.newHigh),
    newMid: normalizeAlertList(row.newMid),
    updatedHigh: normalizeAlertList(row.updatedHigh),
    updatedMid: normalizeAlertList(row.updatedMid),
  };
}

export function disclosureAlertsJsonPath(cwd = process.cwd()): string {
  return path.join(cwd, "tmp", "dart", "disclosure_alerts.json");
}

export function readDisclosureAlerts(filePath = disclosureAlertsJsonPath()): DisclosureAlertsData {
  if (!fs.existsSync(filePath)) return emptyDisclosureAlertsData();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return normalizeAlerts(parsed);
  } catch {
    return emptyDisclosureAlertsData();
  }
}
