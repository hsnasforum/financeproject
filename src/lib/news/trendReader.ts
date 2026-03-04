import fs from "node:fs";
import { resolveNewsTrendsJsonPath } from "./storageSqlite.ts";
import { type TopicTrendsArtifact } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readNewsTopicTrends(filePath = resolveNewsTrendsJsonPath()): TopicTrendsArtifact | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!isRecord(parsed)) return null;
    if (!asString(parsed.generatedAt) || !asString(parsed.todayKst)) return null;
    if (!Array.isArray(parsed.topics)) return null;
    return parsed as TopicTrendsArtifact;
  } catch {
    return null;
  }
}
