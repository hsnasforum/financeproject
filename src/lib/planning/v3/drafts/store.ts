import fs from "node:fs/promises";
import { type Dirent } from "node:fs";
import path from "node:path";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { sanitizeRecordId } from "../../store/paths";
import { type MonthlyCashflow, type ProfileDraftPatch } from "../domain/types";
import { type PlanningV3Draft, type PlanningV3DraftMeta } from "./types";

const SAFE_MONTH_PATTERN = /^\d{4}-\d{2}$/;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 drafts store is server-only.");
  }
}

assertServerOnly();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a finite number`);
  }
  return parsed;
}

function parseNonNegativeInt(value: unknown, field: string): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return parsed;
}

function parseMonth(value: unknown): string {
  const month = asString(value);
  if (!SAFE_MONTH_PATTERN.test(month)) {
    throw new Error("cashflow.ym must match YYYY-MM");
  }
  return month;
}

function normalizeMeta(input: unknown): PlanningV3DraftMeta {
  if (!isRecord(input)) {
    throw new Error("meta must be an object");
  }
  return {
    rows: parseNonNegativeInt(input.rows, "meta.rows"),
    months: parseNonNegativeInt(input.months, "meta.months"),
  };
}

function normalizeCashflow(input: unknown): MonthlyCashflow[] {
  if (!Array.isArray(input)) {
    throw new Error("cashflow must be an array");
  }

  return input.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`cashflow[${index}] must be an object`);
    }
    return {
      ym: parseMonth(row.ym),
      incomeKrw: parseNumber(row.incomeKrw, `cashflow[${index}].incomeKrw`),
      expenseKrw: parseNumber(row.expenseKrw, `cashflow[${index}].expenseKrw`),
      netKrw: parseNumber(row.netKrw, `cashflow[${index}].netKrw`),
      txCount: parseNonNegativeInt(row.txCount, `cashflow[${index}].txCount`),
    };
  });
}

function normalizeAssumptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => asString(row).replace(/\s+/g, " "))
    .filter((row) => row.length > 0)
    .slice(0, 32);
}

function normalizeDraftPatch(input: unknown): ProfileDraftPatch {
  if (!isRecord(input)) {
    throw new Error("draftPatch must be an object");
  }
  return {
    monthlyIncomeNet: parseNumber(input.monthlyIncomeNet, "draftPatch.monthlyIncomeNet"),
    monthlyEssentialExpenses: parseNumber(input.monthlyEssentialExpenses, "draftPatch.monthlyEssentialExpenses"),
    monthlyDiscretionaryExpenses: parseNumber(
      input.monthlyDiscretionaryExpenses,
      "draftPatch.monthlyDiscretionaryExpenses",
    ),
    assumptions: normalizeAssumptions(input.assumptions),
    monthsConsidered: parseNonNegativeInt(input.monthsConsidered, "draftPatch.monthsConsidered"),
  };
}

function normalizeSource(value: unknown): "csv" {
  return value === "csv" ? "csv" : "csv";
}

function parseIso(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) {
    throw new Error("createdAt must be an ISO date");
  }
  return new Date(parsed).toISOString();
}

function resolveDraftsDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_DRAFTS_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "v3", "drafts");
}

function resolveDraftPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveDraftsDir(cwd), `${sanitizeRecordId(id)}.json`);
}

function toDraftFromUnknown(value: unknown): PlanningV3Draft | null {
  if (!isRecord(value)) return null;
  try {
    const id = sanitizeRecordId(value.id);
    return {
      id,
      createdAt: parseIso(value.createdAt),
      source: normalizeSource(value.source),
      meta: normalizeMeta(value.meta),
      cashflow: normalizeCashflow(value.cashflow),
      draftPatch: normalizeDraftPatch(value.draftPatch),
    };
  } catch {
    return null;
  }
}

async function readDraft(filePath: string): Promise<PlanningV3Draft | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return toDraftFromUnknown(JSON.parse(raw));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

function sortByCreatedAtDesc(items: PlanningV3Draft[]): PlanningV3Draft[] {
  return items.slice().sort((a, b) => {
    const left = Date.parse(a.createdAt);
    const right = Date.parse(b.createdAt);
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
      return right - left;
    }
    return b.id.localeCompare(a.id);
  });
}

export async function saveDraft(
  draft: Omit<PlanningV3Draft, "id" | "createdAt">,
): Promise<PlanningV3Draft> {
  assertServerOnly();

  const normalized: PlanningV3Draft = {
    id: sanitizeRecordId(crypto.randomUUID()),
    createdAt: new Date().toISOString(),
    source: normalizeSource(draft.source),
    meta: normalizeMeta(draft.meta),
    cashflow: normalizeCashflow(draft.cashflow),
    draftPatch: normalizeDraftPatch(draft.draftPatch),
  };

  await atomicWriteJson(resolveDraftPath(normalized.id), normalized);
  return normalized;
}

export async function listDrafts(): Promise<Array<Pick<PlanningV3Draft, "id" | "createdAt" | "source" | "meta">>> {
  assertServerOnly();

  let entries: Dirent[];
  try {
    entries = await fs.readdir(resolveDraftsDir(), { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const drafts: PlanningV3Draft[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = entry.name.slice(0, -5);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) continue;
    const draft = await readDraft(path.join(resolveDraftsDir(), entry.name));
    if (!draft) continue;
    drafts.push(draft);
  }

  return sortByCreatedAtDesc(drafts).map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    source: row.source,
    meta: row.meta,
  }));
}

export async function getDraft(id: string): Promise<PlanningV3Draft | null> {
  assertServerOnly();
  return readDraft(resolveDraftPath(id));
}

export async function deleteDraft(id: string): Promise<boolean> {
  assertServerOnly();
  try {
    await fs.unlink(resolveDraftPath(id));
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

