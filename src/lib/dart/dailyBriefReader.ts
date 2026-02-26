import fs from "node:fs";
import path from "node:path";
import type { DailyBrief, DailyBriefItem } from "./dailyBriefBuilder";

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeBriefItem(raw: unknown): DailyBriefItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const kind = asString(row.kind) === "updated" ? "updated" : "new";
  const level = asString(row.level) === "mid" ? "mid" : "high";
  return {
    id: asString(row.id) || `${asString(row.clusterKey)}::${asString(row.rceptNo) || "item"}`,
    clusterKey: asString(row.clusterKey),
    corpCode: asString(row.corpCode),
    corpName: asString(row.corpName) || "-",
    categoryId: asString(row.categoryId),
    categoryLabel: asString(row.categoryLabel) || "기타",
    title: asString(row.title) || "(제목 없음)",
    rceptNo: asString(row.rceptNo),
    date: asString(row.date) || null,
    clusterScore: asNumber(row.clusterScore, 0),
    kind,
    level,
    bucketPriority: Math.max(0, Math.round(asNumber(row.bucketPriority, kind === "new" ? (level === "high" ? 0 : 1) : level === "high" ? 2 : 3))),
    isPinned: Boolean(row.isPinned),
    pinnedAt: asString(row.pinnedAt) || null,
  };
}

function normalizeBrief(raw: unknown): DailyBrief | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const topNewRaw = Array.isArray(row.topNew) ? row.topNew : [];
  const topUpdatedRaw = Array.isArray(row.topUpdated) ? row.topUpdated : [];
  const topNew = topNewRaw.map(normalizeBriefItem).filter((item): item is DailyBriefItem => item !== null);
  const topUpdated = topUpdatedRaw.map(normalizeBriefItem).filter((item): item is DailyBriefItem => item !== null);
  const lines = Array.isArray(row.lines) ? row.lines.map((line) => asString(line)).filter(Boolean) : [];
  const statsRaw = row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
    ? (row.stats as Record<string, unknown>)
    : {};
  return {
    generatedAt: asString(row.generatedAt) || null,
    stats: {
      newHigh: Math.max(0, Math.round(asNumber(statsRaw.newHigh, 0))),
      newMid: Math.max(0, Math.round(asNumber(statsRaw.newMid, 0))),
      updatedHigh: Math.max(0, Math.round(asNumber(statsRaw.updatedHigh, 0))),
      updatedMid: Math.max(0, Math.round(asNumber(statsRaw.updatedMid, 0))),
      total: Math.max(0, Math.round(asNumber(statsRaw.total, topNew.length + topUpdated.length))),
      shown: Math.max(0, Math.round(asNumber(statsRaw.shown, lines.length))),
      maxLines: Math.max(1, Math.round(asNumber(statsRaw.maxLines, 10))),
    },
    topNew,
    topUpdated,
    lines,
  };
}

export function dailyBriefJsonPath(cwd = process.cwd()): string {
  return path.join(cwd, "tmp", "dart", "daily_brief.json");
}

export function readDailyBrief(filePath = dailyBriefJsonPath()): DailyBrief | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return normalizeBrief(parsed);
  } catch {
    return null;
  }
}
