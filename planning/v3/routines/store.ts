import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDir } from "../../../src/lib/planning/storage/dataDir";
import { parseWithV3Whitelist } from "../security/whitelist";
import {
  DailyRoutineChecklistSchema,
  buildDefaultDailyRoutineChecklist,
  normalizeDailyRoutineChecklistInput,
  type DailyRoutineChecklist,
} from "./contracts";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 routines store is server-only.");
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.tmp-${randomUUID()}.json`);
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function safeDate(value: string): string {
  return DailyRoutineChecklistSchema.shape.date.parse(value);
}

export function resolveRoutineDailyDir(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "routines", "daily");
}

export function resolveRoutineDailyPath(date: string, cwd = process.cwd()): string {
  return path.join(resolveRoutineDailyDir(cwd), `${safeDate(date)}.json`);
}

export function readDailyRoutineChecklist(date: string, cwd = process.cwd()): DailyRoutineChecklist {
  assertServerOnly();
  const normalizedDate = safeDate(date);
  const filePath = resolveRoutineDailyPath(normalizedDate, cwd);
  if (!fs.existsSync(filePath)) {
    return buildDefaultDailyRoutineChecklist(normalizedDate);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return DailyRoutineChecklistSchema.parse(parsed);
  } catch {
    return buildDefaultDailyRoutineChecklist(normalizedDate);
  }
}

export function saveDailyRoutineChecklist(input: unknown, cwd = process.cwd()): DailyRoutineChecklist {
  assertServerOnly();
  const normalizedInput = normalizeDailyRoutineChecklistInput(input);
  const base = buildDefaultDailyRoutineChecklist(normalizedInput.date);
  const checkedById = new Map(
    (normalizedInput.items ?? []).map((row) => [row.id, row.checked] as const),
  );
  const next = parseWithV3Whitelist(DailyRoutineChecklistSchema, {
    ...base,
    schemaVersion: 1,
    items: base.items.map((row) => ({
      ...row,
      checked: checkedById.get(row.id) ?? false,
    })),
    savedAt: new Date().toISOString(),
  }, {
    scope: "persistence",
    context: "routines.store.daily",
  });

  atomicWriteJson(resolveRoutineDailyPath(next.date, cwd), next);
  return next;
}
