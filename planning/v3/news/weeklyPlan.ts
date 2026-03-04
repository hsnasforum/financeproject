import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizeSeriesId } from "../indicators/aliases";
import { parseWithV3Whitelist } from "../security/whitelist";
import { canonicalizeTopicId } from "./taxonomy";

const DEFAULT_NEWS_ROOT = path.join(process.cwd(), ".data", "news");

const WeeklyPlanTokenSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9_:-]+$/i);

export const WeeklyPlanSchema = z.object({
  schemaVersion: z.number().int().positive(),
  savedAt: z.string().datetime(),
  weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topics: z.array(WeeklyPlanTokenSchema).max(20),
  seriesIds: z.array(WeeklyPlanTokenSchema).max(40),
}).strict();

export const WeeklyPlanInputSchema = z.object({
  weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  topics: z.array(z.string()).max(200).default([]),
  seriesIds: z.array(z.string()).max(200).default([]),
}).strict();

export type WeeklyPlan = z.infer<typeof WeeklyPlanSchema>;
export type WeeklyPlanInput = z.infer<typeof WeeklyPlanInputSchema>;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 weekly plan store is server-only.");
  }
}

export function resolveWeeklyPlanPath(rootDir = DEFAULT_NEWS_ROOT): string {
  return path.join(rootDir, "weekly_plan.json");
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.tmp-${randomUUID()}.json`);
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function toKstDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((row) => row.type === "year")?.value ?? "0");
  const month = Number(parts.find((row) => row.type === "month")?.value ?? "0");
  const day = Number(parts.find((row) => row.type === "day")?.value ?? "0");
  const weekdayText = (parts.find((row) => row.type === "weekday")?.value ?? "").toLowerCase();
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return {
    year,
    month,
    day,
    weekday: weekdayMap[weekdayText] ?? 0,
  };
}

function toIsoDate(year: number, month: number, day: number): string {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toUtcNoonTimestamp(year: number, month: number, day: number): number {
  return Date.UTC(year, Math.max(0, month - 1), day, 12, 0, 0, 0);
}

export function currentKstWeekOf(now = new Date()): string {
  const current = toKstDateParts(now);
  const offsetToMonday = current.weekday === 0 ? -6 : 1 - current.weekday;
  const ts = toUtcNoonTimestamp(current.year, current.month, current.day) + (offsetToMonday * 24 * 60 * 60 * 1000);
  const monday = toKstDateParts(new Date(ts));
  return toIsoDate(monday.year, monday.month, monday.day);
}

function dedupeNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeTopic(value: string): string {
  const canonical = canonicalizeTopicId(value);
  return canonical
    .trim()
    .toLowerCase()
    .replace(/[\s./-]+/g, "_")
    .replace(/[^a-z0-9_:-]/g, "");
}

function normalizeSeries(value: string): string {
  return normalizeSeriesId(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, "");
}

export function parseWeeklyPlanInput(value: unknown): WeeklyPlanInput {
  return WeeklyPlanInputSchema.parse(value);
}

export function normalizeWeeklyPlanInput(value: unknown): WeeklyPlanInput {
  const parsed = parseWeeklyPlanInput(value);
  return {
    weekOf: parsed.weekOf,
    topics: dedupeNormalized(parsed.topics.map(normalizeTopic).filter(Boolean)).slice(0, 20),
    seriesIds: dedupeNormalized(parsed.seriesIds.map(normalizeSeries).filter(Boolean)).slice(0, 40),
  };
}

export function readWeeklyPlan(rootDir = DEFAULT_NEWS_ROOT): WeeklyPlan | null {
  assertServerOnly();
  const filePath = resolveWeeklyPlanPath(rootDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return WeeklyPlanSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function writeWeeklyPlan(value: unknown, rootDir = DEFAULT_NEWS_ROOT): WeeklyPlan {
  assertServerOnly();
  const normalizedInput = normalizeWeeklyPlanInput(value);
  const next = parseWithV3Whitelist(WeeklyPlanSchema, {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    weekOf: normalizedInput.weekOf ?? currentKstWeekOf(),
    topics: normalizedInput.topics,
    seriesIds: normalizedInput.seriesIds,
  }, {
    scope: "persistence",
    context: "news.weeklyPlan",
  });

  atomicWriteJson(resolveWeeklyPlanPath(rootDir), next);
  return next;
}
