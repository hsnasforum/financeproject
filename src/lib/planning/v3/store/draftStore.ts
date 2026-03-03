import fs from "node:fs/promises";
import { type Dirent } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { type MonthlyCashflow, type ProfileV2DraftPatch } from "../domain/types";
import { type V3DraftRecord, type V3DraftSource, type V3DraftSummary } from "../domain/draft";

type CreateDraftInput = {
  source?: unknown;
  cashflow: unknown;
  draftPatch: unknown;
  summary?: unknown;
};

const SAFE_MONTH_PATTERN = /^\d{4}-\d{2}$/;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 draft store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("invalid number");
  }
  return parsed;
}

function parseNonNegativeInt(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("invalid integer");
  }
  return parsed;
}

function parseMonth(value: unknown): string {
  const month = asString(value);
  if (!SAFE_MONTH_PATTERN.test(month)) {
    throw new Error("invalid month");
  }
  return month;
}

function normalizeFilename(value: unknown): string | undefined {
  const text = asString(value).replace(/[\u0000-\u001F\u007F]/g, "");
  if (!text) return undefined;
  return text.slice(0, 200);
}

function normalizeCashflow(input: unknown): MonthlyCashflow[] {
  if (!Array.isArray(input)) {
    throw new Error("cashflow must be an array");
  }

  return input.map((row) => {
    if (!isRecord(row)) {
      throw new Error("cashflow row must be an object");
    }

    return {
      ym: parseMonth(row.ym),
      incomeKrw: parseFiniteNumber(row.incomeKrw),
      expenseKrw: parseFiniteNumber(row.expenseKrw),
      netKrw: parseFiniteNumber(row.netKrw),
      txCount: parseNonNegativeInt(row.txCount),
    };
  });
}

function normalizeNotes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => asString(row).replace(/\s+/g, " "))
    .filter((row) => row.length > 0)
    .slice(0, 32);
}

function normalizeDraftPatch(input: unknown): ProfileV2DraftPatch {
  if (!isRecord(input)) {
    throw new Error("draftPatch must be an object");
  }

  return {
    monthlyIncomeNet: parseFiniteNumber(input.monthlyIncomeNet),
    monthlyEssentialExpenses: parseFiniteNumber(input.monthlyEssentialExpenses),
    monthlyDiscretionaryExpenses: parseFiniteNumber(input.monthlyDiscretionaryExpenses),
    assumptions: normalizeNotes(input.assumptions),
    monthsConsidered: parseNonNegativeInt(input.monthsConsidered),
  };
}

function medianRounded(values: number[]): number | undefined {
  if (values.length < 1) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[mid]);
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function averageRounded(values: number[]): number | undefined {
  if (values.length < 1) return undefined;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function computeSummary(cashflow: MonthlyCashflow[], draftPatch: ProfileV2DraftPatch): V3DraftSummary {
  const medianIncomeKrw = medianRounded(cashflow.map((row) => row.incomeKrw));
  const medianExpenseKrw = medianRounded(cashflow.map((row) => Math.abs(row.expenseKrw)));
  const avgNetKrw = averageRounded(cashflow.map((row) => row.netKrw));
  const notes = normalizeNotes(draftPatch.assumptions);

  return {
    ...(medianIncomeKrw !== undefined ? { medianIncomeKrw } : {}),
    ...(medianExpenseKrw !== undefined ? { medianExpenseKrw } : {}),
    ...(avgNetKrw !== undefined ? { avgNetKrw } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

function normalizeSource(input: unknown, cashflow: MonthlyCashflow[]): V3DraftSource {
  if (!isRecord(input)) {
    return {
      kind: "csv",
      rows: cashflow.reduce((sum, row) => sum + row.txCount, 0),
      months: cashflow.length,
    };
  }

  const filename = normalizeFilename(input.filename);
  return {
    kind: "csv",
    ...(filename ? { filename } : {}),
    ...(input.rows !== undefined ? { rows: parseNonNegativeInt(input.rows) } : {}),
    ...(input.months !== undefined ? { months: parseNonNegativeInt(input.months) } : {}),
  };
}

function parseIso(value: unknown): string {
  const raw = asString(value);
  const timestamp = Date.parse(raw);
  if (!raw || !Number.isFinite(timestamp)) {
    throw new Error("invalid createdAt");
  }
  return new Date(timestamp).toISOString();
}

function resolveDraftsDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_DRAFTS_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "v3", "drafts");
}

function resolveDraftPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveDraftsDir(cwd), `${sanitizeRecordId(id)}.json`);
}

function toV3DraftRecord(value: unknown): V3DraftRecord | null {
  if (!isRecord(value)) return null;
  try {
    const cashflow = normalizeCashflow(value.cashflow);
    const draftPatch = normalizeDraftPatch(value.draftPatch);
    const source = normalizeSource(value.source, cashflow);
    const summary = isRecord(value.summary) ? {
      ...(value.summary.medianIncomeKrw !== undefined
        ? { medianIncomeKrw: parseFiniteNumber(value.summary.medianIncomeKrw) }
        : {}),
      ...(value.summary.medianExpenseKrw !== undefined
        ? { medianExpenseKrw: parseFiniteNumber(value.summary.medianExpenseKrw) }
        : {}),
      ...(value.summary.avgNetKrw !== undefined
        ? { avgNetKrw: parseFiniteNumber(value.summary.avgNetKrw) }
        : {}),
      ...(value.summary.notes !== undefined ? { notes: normalizeNotes(value.summary.notes) } : {}),
    } : computeSummary(cashflow, draftPatch);

    return {
      id: sanitizeRecordId(value.id),
      createdAt: parseIso(value.createdAt),
      source,
      cashflow,
      draftPatch,
      summary,
    };
  } catch {
    return null;
  }
}

async function readDraftFromFile(filePath: string): Promise<V3DraftRecord | null> {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    return toV3DraftRecord(JSON.parse(text));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    return null;
  }
}

function sortByCreatedAtDesc(records: V3DraftRecord[]): V3DraftRecord[] {
  return records.slice().sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return right.id.localeCompare(left.id);
  });
}

export async function createDraft(recordInput: CreateDraftInput): Promise<V3DraftRecord> {
  assertServerOnly();

  const cashflow = normalizeCashflow(recordInput.cashflow);
  const draftPatch = normalizeDraftPatch(recordInput.draftPatch);
  const source = normalizeSource(recordInput.source, cashflow);
  const summary = computeSummary(cashflow, draftPatch);

  const record: V3DraftRecord = {
    id: sanitizeRecordId(randomUUID()),
    createdAt: new Date().toISOString(),
    source,
    cashflow,
    draftPatch,
    summary,
  };

  await atomicWriteJson(resolveDraftPath(record.id), record);
  return record;
}

export async function listDrafts(): Promise<V3DraftRecord[]> {
  assertServerOnly();

  let entries: Dirent[];
  try {
    entries = await fs.readdir(resolveDraftsDir(), { withFileTypes: true });
  } catch {
    return [];
  }

  const drafts: V3DraftRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = entry.name.slice(0, -5);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) continue;
    const record = await readDraftFromFile(path.join(resolveDraftsDir(), entry.name));
    if (!record) continue;
    drafts.push(record);
  }

  return sortByCreatedAtDesc(drafts);
}

export async function getDraft(id: string): Promise<V3DraftRecord | null> {
  assertServerOnly();
  try {
    return await readDraftFromFile(resolveDraftPath(id));
  } catch {
    return null;
  }
}

export async function deleteDraft(id: string): Promise<boolean> {
  assertServerOnly();
  try {
    await fs.unlink(resolveDraftPath(id));
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    return false;
  }
}
