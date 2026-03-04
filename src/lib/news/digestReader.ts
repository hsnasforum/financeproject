import fs from "node:fs";
import { resolveNewsDigestDayJsonPath } from "./storageSqlite";
import { type DigestDay } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readNewsDigestDay(filePath = resolveNewsDigestDayJsonPath()): DigestDay | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!isRecord(parsed)) return null;
    if (!asString(parsed.date) || !asString(parsed.generatedAt)) return null;
    return parsed as DigestDay;
  } catch {
    return null;
  }
}
