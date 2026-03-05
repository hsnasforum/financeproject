import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDir } from "../../../src/lib/planning/storage/dataDir";
import {
  JournalEntrySchema,
  parseJournalEntry,
  parseJournalEntryInput,
  type JournalEntry,
  type JournalEntryInput,
} from "./contracts";
import { parseWithV3Whitelist } from "../security/whitelist";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 journal store is server-only.");
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.tmp-${randomUUID()}.json`);
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = asString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function resolveJournalDir(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "journal", "entries");
}

function resolveJournalPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveJournalDir(cwd), `${id}.json`);
}

function sanitizeInput(input: JournalEntryInput): JournalEntryInput {
  return {
    ...input,
    observations: dedupe(input.observations),
    assumptions: dedupe(input.assumptions),
    chosenOptions: dedupe(input.chosenOptions),
    followUpChecklist: dedupe(input.followUpChecklist),
    linkedItems: dedupe(input.linkedItems),
    linkedIndicators: dedupe(input.linkedIndicators),
    linkedScenarioIds: dedupe(input.linkedScenarioIds),
    watchSeriesIds: dedupe(input.watchSeriesIds),
    impactSnapshot: input.impactSnapshot.map((row) => ({ ...row })),
  };
}

export function listJournalEntries(cwd = process.cwd()): JournalEntry[] {
  assertServerOnly();
  const dir = resolveJournalDir(cwd);
  if (!fs.existsSync(dir)) return [];

  const out: JournalEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8")) as unknown;
      out.push(parseJournalEntry(parsed));
    } catch {
      continue;
    }
  }

  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getJournalEntry(id: string, cwd = process.cwd()): JournalEntry | null {
  assertServerOnly();
  const safeId = asString(id);
  if (!safeId) return null;
  const filePath = resolveJournalPath(safeId, cwd);
  if (!fs.existsSync(filePath)) return null;
  try {
    return parseJournalEntry(JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown);
  } catch {
    return null;
  }
}

export function createJournalEntry(input: unknown, cwd = process.cwd()): JournalEntry {
  assertServerOnly();
  const parsed = parseJournalEntryInput(input);
  const sanitized = sanitizeInput(parsed);
  const now = new Date().toISOString();
  const entry: JournalEntry = parseWithV3Whitelist(JournalEntrySchema, parseJournalEntry({
    ...sanitized,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  }), {
    scope: "persistence",
    context: "journal.store.create",
  });
  atomicWriteJson(resolveJournalPath(entry.id, cwd), entry);
  return entry;
}

export function updateJournalEntry(id: string, input: unknown, cwd = process.cwd()): JournalEntry {
  assertServerOnly();
  const current = getJournalEntry(id, cwd);
  if (!current) {
    throw new Error("NOT_FOUND");
  }

  const parsed = parseJournalEntryInput(input);
  const sanitized = sanitizeInput(parsed);
  const next = parseWithV3Whitelist(JournalEntrySchema, parseJournalEntry({
    ...sanitized,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  }), {
    scope: "persistence",
    context: "journal.store.update",
  });

  atomicWriteJson(resolveJournalPath(current.id, cwd), next);
  return next;
}
