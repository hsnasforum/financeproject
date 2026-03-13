import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { roundKrw } from "../../calc";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import {
  type V3DraftCashflowRow,
  type V3DraftRecord,
  type V3DraftSource,
  type V3DraftSummary,
} from "../domain/draft";
import { type DraftProfileRecord } from "../domain/draftTypes";
import {
  GenerateDraftPatchFromBatchError,
  generateDraftPatchFromBatch,
} from "../service/generateDraftPatchFromBatch";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "../service/forbiddenDraftKeys";

type CreateDraftInput = Omit<V3DraftRecord, "id" | "createdAt" | "summary"> & {
  summary?: V3DraftSummary;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 draft store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundKrw(parsed) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCreatedAt(value: unknown): string {
  const text = asString(value);
  const ts = Date.parse(text);
  if (!text || !Number.isFinite(ts)) return new Date(0).toISOString();
  return new Date(ts).toISOString();
}

function resolveDraftsDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_DRAFTS_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "planning-v3", "drafts");
}

function resolveLegacyDraftsDir(cwd = process.cwd()): string {
  return path.join(resolvePlanningDataDir({ cwd }), "v3", "drafts");
}

function resolveDraftPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveDraftsDir(cwd), `${sanitizeRecordId(id)}.json`);
}

function normalizeSource(value: unknown): V3DraftSource {
  if (!isRecord(value) || value.kind !== "csv") {
    return { kind: "csv" };
  }
  const filename = asString(value.filename);
  const rows = Number.isFinite(Number(value.rows)) ? Math.max(0, Math.trunc(Number(value.rows))) : undefined;
  const months = Number.isFinite(Number(value.months)) ? Math.max(0, Math.trunc(Number(value.months))) : undefined;
  return {
    kind: "csv",
    ...(filename ? { filename: filename.slice(0, 200) } : {}),
    ...(rows !== undefined ? { rows } : {}),
    ...(months !== undefined ? { months } : {}),
  };
}

function normalizeCashflow(rows: unknown): V3DraftCashflowRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!isRecord(row)) return null;
      const ym = asString(row.ym);
      if (!/^\d{4}-\d{2}$/.test(ym)) return null;
      return {
        ym,
        incomeKrw: asNumber(row.incomeKrw),
        expenseKrw: asNumber(row.expenseKrw),
        netKrw: asNumber(row.netKrw),
        ...(Number.isFinite(Number(row.txCount)) ? { txCount: Math.max(0, Math.trunc(Number(row.txCount))) } : {}),
      };
    })
    .filter((row): row is V3DraftCashflowRow => row !== null)
    .sort((left, right) => left.ym.localeCompare(right.ym));
}

function normalizeDraftPatch(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return value;
}

function median(values: number[]): number {
  if (values.length < 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.trunc(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return roundKrw(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function average(values: number[]): number {
  if (values.length < 1) return 0;
  return roundKrw(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function buildSummary(rows: V3DraftCashflowRow[], input?: V3DraftSummary): V3DraftSummary {
  if (input && isRecord(input)) {
    return {
      ...(Number.isFinite(Number(input.medianIncomeKrw)) ? { medianIncomeKrw: asNumber(input.medianIncomeKrw) } : {}),
      ...(Number.isFinite(Number(input.medianExpenseKrw)) ? { medianExpenseKrw: asNumber(input.medianExpenseKrw) } : {}),
      ...(Number.isFinite(Number(input.avgNetKrw)) ? { avgNetKrw: asNumber(input.avgNetKrw) } : {}),
      ...(Array.isArray(input.notes)
        ? { notes: input.notes.map((entry) => asString(entry)).filter((entry) => entry.length > 0).slice(0, 20) }
        : {}),
    };
  }

  return {
    ...(rows.length > 0 ? { medianIncomeKrw: median(rows.map((row) => row.incomeKrw)) } : {}),
    ...(rows.length > 0 ? { medianExpenseKrw: median(rows.map((row) => Math.abs(row.expenseKrw))) } : {}),
    ...(rows.length > 0 ? { avgNetKrw: average(rows.map((row) => row.netKrw)) } : {}),
  };
}

function normalizeDraft(value: unknown): V3DraftRecord | null {
  if (!isRecord(value)) return null;
  try {
    const id = sanitizeRecordId(value.id);
    const createdAt = normalizeCreatedAt(value.createdAt);
    const source = normalizeSource(value.source);
    const cashflow = normalizeCashflow(value.cashflow);
    const draftPatch = normalizeDraftPatch(value.draftPatch);
    const summary = buildSummary(cashflow, isRecord(value.summary) ? value.summary as V3DraftSummary : undefined);
    return {
      id,
      createdAt,
      source,
      cashflow,
      draftPatch,
      summary,
    };
  } catch {
    return null;
  }
}

async function readDraftFromPath(filePath: string): Promise<V3DraftRecord | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
    return normalizeDraft(parsed);
  } catch {
    return null;
  }
}

async function listDraftFiles(): Promise<string[]> {
  const roots = [resolveDraftsDir(), resolveLegacyDraftsDir()];
  const fileSet = new Set<string>();
  for (const root of roots) {
    try {
      const names = await fs.readdir(root);
      for (const name of names) {
        if (name.endsWith(".json")) {
          fileSet.add(path.join(root, name));
        }
      }
    } catch {
      continue;
    }
  }
  return [...fileSet].sort((left, right) => left.localeCompare(right));
}

async function readAllDrafts(): Promise<V3DraftRecord[]> {
  const files = await listDraftFiles();
  const drafts = (await Promise.all(files.map((file) => readDraftFromPath(file))))
    .filter((row): row is V3DraftRecord => row !== null);
  return drafts.sort((left, right) => {
    const leftTs = Date.parse(left.createdAt);
    const rightTs = Date.parse(right.createdAt);
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return left.id.localeCompare(right.id);
  });
}

export async function createDraft(input: CreateDraftInput): Promise<V3DraftRecord> {
  assertServerOnly();

  const cashflow = normalizeCashflow(input.cashflow);
  const source = normalizeSource(input.source);
  const draftPatch = normalizeDraftPatch(input.draftPatch);
  const draft: V3DraftRecord = {
    id: sanitizeRecordId(randomUUID()),
    createdAt: new Date().toISOString(),
    source,
    cashflow,
    draftPatch,
    summary: buildSummary(cashflow, input.summary),
  };

  await atomicWriteJson(resolveDraftPath(draft.id), draft);
  return draft;
}

export const saveDraft = createDraft;

export async function listDrafts(): Promise<Array<Pick<V3DraftRecord, "id" | "createdAt" | "source" | "summary">>> {
  assertServerOnly();
  const rows = await readAllDrafts();
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    source: row.source,
    summary: row.summary,
  }));
}

export async function getDraft(id: string): Promise<V3DraftRecord | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const primary = await readDraftFromPath(resolveDraftPath(safeId));
  if (primary) return primary;
  return readDraftFromPath(path.join(resolveLegacyDraftsDir(), `${safeId}.json`));
}

export async function deleteDraft(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const targets = [
    resolveDraftPath(safeId),
    path.join(resolveLegacyDraftsDir(), `${safeId}.json`),
  ];

  let deleted = false;
  for (const target of targets) {
    try {
      await fs.unlink(target);
      deleted = true;
    } catch {
      continue;
    }
  }
  return deleted;
}

function normalizeProfileStats(value: unknown): DraftProfileRecord["stats"] | undefined {
  if (!isRecord(value)) return undefined;
  const months = Number(value.months);
  if (!Number.isFinite(months) || months < 0) return undefined;
  const normalizedMonths = Math.trunc(months);
  const transfersExcluded = value.transfersExcluded === true ? true : undefined;
  const unassignedCount = Number(value.unassignedCount);
  return {
    months: normalizedMonths,
    ...(transfersExcluded ? { transfersExcluded } : {}),
    ...(Number.isFinite(unassignedCount) && unassignedCount >= 0 ? { unassignedCount: Math.trunc(unassignedCount) } : {}),
  };
}

function normalizeProfileDraftRecord(value: unknown): DraftProfileRecord | null {
  if (!isRecord(value)) return null;
  try {
    const id = sanitizeRecordId(value.id);
    const batchId = sanitizeRecordId(value.batchId);
    const createdAt = normalizeCreatedAt(value.createdAt);
    if (!isRecord(value.draftPatch) || !isRecord(value.evidence) || !Array.isArray(value.assumptions)) {
      return null;
    }

    const assumptions = value.assumptions
      .map((entry) => asString(entry))
      .filter((entry) => entry.length > 0)
      .slice(0, 50);

    const record: DraftProfileRecord = {
      id,
      batchId,
      createdAt,
      draftPatch: value.draftPatch as DraftProfileRecord["draftPatch"],
      evidence: value.evidence as DraftProfileRecord["evidence"],
      assumptions,
      ...(normalizeProfileStats(value.stats) ? { stats: normalizeProfileStats(value.stats) } : {}),
    };
    assertNoForbiddenDraftKeys(record);
    return record;
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) {
      throw error;
    }
    return null;
  }
}

async function readProfileDraftFromPath(filePath: string): Promise<DraftProfileRecord | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
    return normalizeProfileDraftRecord(parsed);
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) {
      throw error;
    }
    return null;
  }
}

function sortProfileDrafts(rows: DraftProfileRecord[]): DraftProfileRecord[] {
  return [...rows].sort((left, right) => {
    const leftTs = Date.parse(left.createdAt);
    const rightTs = Date.parse(right.createdAt);
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return right.id.localeCompare(left.id);
  });
}

function toOrderedProfileDraftRecord(record: DraftProfileRecord): DraftProfileRecord {
  return {
    id: record.id,
    batchId: record.batchId,
    createdAt: record.createdAt,
    draftPatch: record.draftPatch,
    evidence: record.evidence,
    assumptions: record.assumptions,
    ...(record.stats ? { stats: record.stats } : {}),
  };
}

export async function createDraftFromBatch(batchId: string): Promise<DraftProfileRecord> {
  assertServerOnly();
  const safeBatchId = sanitizeRecordId(batchId);

  const built = await generateDraftPatchFromBatch({ batchId: safeBatchId });
  const record: DraftProfileRecord = {
    id: sanitizeRecordId(randomUUID()),
    batchId: safeBatchId,
    createdAt: new Date().toISOString(),
    draftPatch: built.draftPatch,
    evidence: built.evidence,
    assumptions: built.assumptions,
    stats: {
      months: built.stats.months,
      transfersExcluded: built.stats.transfersExcluded,
      ...(Number.isFinite(built.stats.unassignedCount) ? { unassignedCount: built.stats.unassignedCount } : {}),
    },
  };

  assertNoForbiddenDraftKeys(record);
  await atomicWriteJson(resolveDraftPath(record.id), toOrderedProfileDraftRecord(record));
  return record;
}

export async function listProfileDrafts(): Promise<DraftProfileRecord[]> {
  assertServerOnly();
  const files = await listDraftFiles();
  const rows = (await Promise.all(files.map((filePath) => readProfileDraftFromPath(filePath))))
    .filter((row): row is DraftProfileRecord => row !== null);
  return sortProfileDrafts(rows);
}

export async function getProfileDraft(id: string): Promise<DraftProfileRecord | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const primary = await readProfileDraftFromPath(resolveDraftPath(safeId));
  if (primary) return primary;
  return readProfileDraftFromPath(path.join(resolveLegacyDraftsDir(), `${safeId}.json`));
}

export async function deleteProfileDraft(id: string): Promise<{ deleted: boolean }> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const targets = [
    resolveDraftPath(safeId),
    path.join(resolveLegacyDraftsDir(), `${safeId}.json`),
  ];

  let deleted = false;
  for (const target of targets) {
    try {
      await fs.unlink(target);
      deleted = true;
    } catch {
      continue;
    }
  }
  return { deleted };
}

export function isGenerateDraftInputError(error: unknown): error is GenerateDraftPatchFromBatchError {
  return error instanceof GenerateDraftPatchFromBatchError;
}
