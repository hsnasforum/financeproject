import fs from "node:fs";
import { resolveNewsBriefJsonPath } from "./storageSqlite.ts";
import { type NewsBrief } from "./types.ts";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBrief(raw: unknown): NewsBrief | null {
  if (!isRecord(raw)) return null;

  const generatedAt = asString(raw.generatedAt);
  if (!generatedAt) return null;

  const statsRaw = isRecord(raw.stats) ? raw.stats : {};

  return {
    generatedAt,
    stats: {
      totalItems: Math.max(0, Math.round(asNumber(statsRaw.totalItems, 0))),
      totalClusters: Math.max(0, Math.round(asNumber(statsRaw.totalClusters, 0))),
      dedupedCount: Math.max(0, Math.round(asNumber(statsRaw.dedupedCount, 0))),
      feeds: Math.max(0, Math.round(asNumber(statsRaw.feeds, 0))),
    },
    topToday: Array.isArray(raw.topToday) ? (raw.topToday as NewsBrief["topToday"]) : [],
    topByTopic: Array.isArray(raw.topByTopic) ? (raw.topByTopic as NewsBrief["topByTopic"]) : [],
    risingTopics: Array.isArray(raw.risingTopics) ? (raw.risingTopics as NewsBrief["risingTopics"]) : [],
    summary: isRecord(raw.summary)
      ? {
          observation: asString(raw.summary.observation),
          evidenceLinks: Array.isArray(raw.summary.evidenceLinks)
            ? raw.summary.evidenceLinks.map((entry) => asString(entry)).filter(Boolean)
            : [],
          watchVariables: Array.isArray(raw.summary.watchVariables)
            ? raw.summary.watchVariables.map((entry) => asString(entry)).filter(Boolean)
            : [],
          counterSignals: Array.isArray(raw.summary.counterSignals)
            ? raw.summary.counterSignals.map((entry) => asString(entry)).filter(Boolean)
            : [],
        }
      : {
          observation: "",
          evidenceLinks: [],
          watchVariables: [],
          counterSignals: [],
        },
  };
}

export function readNewsBrief(filePath = resolveNewsBriefJsonPath()): NewsBrief | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return normalizeBrief(parsed);
  } catch {
    return null;
  }
}
