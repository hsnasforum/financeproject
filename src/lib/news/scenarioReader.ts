import fs from "node:fs";
import { resolveNewsScenarioJsonPath } from "./storageSqlite.ts";
import { type NewsScenarioPack } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readNewsScenarioPack(filePath = resolveNewsScenarioJsonPath()): NewsScenarioPack | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!isRecord(parsed)) return null;
    if (!asString(parsed.generatedAt)) return null;
    if (!Array.isArray(parsed.scenarios)) return null;
    return parsed as NewsScenarioPack;
  } catch {
    return null;
  }
}
