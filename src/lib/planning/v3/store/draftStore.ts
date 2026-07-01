import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { roundKrw } from "../../calc";
import { atomicWriteJson } from "../../storage/atomicWrite";
import {
  readJsonFile,
  isStorageNotFoundError,
  storageSchemaCorrupted,
  toStorageReadError,
} from "../../storage/serverFileRead";
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
import { isPlanningNamespaceEnabled } from "../../store/namespace";
import { resolvePlanningV3DataDir, resolvePlanningV3LegacyDataDir } from "./dataDir";

type CreateDraftInput = Omit<V3DraftRecord, "id" | "createdAt" | "summary"> & {
  summary?: V3DraftSummary;
};

type DraftStorageKind = "cashflow" | "profile";

const CASHFLOW_DRAFTS_DIR = "cashflow";
const PROFILE_DRAFTS_DIR = "profile";
const DRAFT_MIGRATION_BACKUP_DIR = "_migration-backup";
const DRAFT_QUARANTINE_DIR = "_quarantine";

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
  if (isPlanningNamespaceEnabled()) return path.join(resolvePlanningV3DataDir(cwd), "drafts");
  const override = asString(process.env.PLANNING_V3_DRAFTS_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningV3DataDir(cwd), "drafts");
}

function resolveLegacyDraftsDir(cwd = process.cwd()): string {
  return path.join(resolvePlanningV3LegacyDataDir(cwd), "drafts");
}

function resolveDraftKindDir(kind: DraftStorageKind, cwd = process.cwd()): string {
  return path.join(resolveDraftsDir(cwd), kind === "cashflow" ? CASHFLOW_DRAFTS_DIR : PROFILE_DRAFTS_DIR);
}

function resolveDraftPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveDraftKindDir("cashflow", cwd), `${sanitizeRecordId(id)}.json`);
}

function resolveProfileDraftPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveDraftKindDir("profile", cwd), `${sanitizeRecordId(id)}.json`);
}

function resolveLegacyPrimaryDraftPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveDraftsDir(cwd), `${sanitizeRecordId(id)}.json`);
}

function resolveLegacySecondaryDraftPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveLegacyDraftsDir(cwd), `${sanitizeRecordId(id)}.json`);
}

function resolveDraftMigrationBackupDir(cwd = process.cwd()): string {
  return path.join(resolveDraftsDir(cwd), DRAFT_MIGRATION_BACKUP_DIR);
}

function resolveDraftQuarantineDir(cwd = process.cwd()): string {
  return path.join(resolveDraftsDir(cwd), DRAFT_QUARANTINE_DIR);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isStorageNotFoundError(error)) return false;
    throw toStorageReadError(error, filePath);
  }
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

function parseStoredSource(value: unknown): V3DraftSource | null {
  if (!isRecord(value) || value.kind !== "csv") return null;
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
    const source = parseStoredSource(value.source);
    if (!source) return null;
    if (!Array.isArray(value.cashflow) || !isRecord(value.draftPatch) || !isRecord(value.summary)) return null;
    const cashflow = normalizeCashflow(value.cashflow);
    const draftPatch = normalizeDraftPatch(value.draftPatch);
    const summary = buildSummary(cashflow, value.summary as V3DraftSummary);
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
  const parsed = await readJsonFile(filePath);
  if (parsed.kind === "not-found") return null;
  const draft = normalizeDraft(parsed.value);
  if (!draft) throw storageSchemaCorrupted(filePath, "draft storage schema is invalid");
  return draft;
}

function classifyLegacyPayload(payload: unknown): DraftStorageKind | null {
  const cashflow = normalizeDraft(payload);
  const profile = normalizeProfileDraftRecord(payload);
  if (cashflow && !profile) return "cashflow";
  if (profile && !cashflow) return "profile";
  return null;
}

async function classifyLegacyDraftFile(filePath: string): Promise<DraftStorageKind> {
  const parsed = await readJsonFile(filePath);
  if (parsed.kind === "not-found") {
    throw storageSchemaCorrupted(filePath, "draft storage file disappeared during classification");
  }
  const kind = classifyLegacyPayload(parsed.value);
  if (kind) return kind;
  throw storageSchemaCorrupted(filePath, "draft storage kind is ambiguous");
}

async function listFlatDraftFiles(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(root, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (!isStorageNotFoundError(error)) throw toStorageReadError(error, root);
    return [];
  }
}

async function listTypedDraftFiles(kind: DraftStorageKind): Promise<string[]> {
  return listFlatDraftFiles(resolveDraftKindDir(kind));
}

async function listLegacyDraftFiles(kind: DraftStorageKind, ignoredIds = new Set<string>()): Promise<string[]> {
  const roots = [resolveDraftsDir(), resolveLegacyDraftsDir()];
  const fileSet = new Set<string>();
  for (const root of roots) {
    try {
      const files = await listFlatDraftFiles(root);
      for (const filePath of files) {
        if (ignoredIds.has(basenameId(filePath))) continue;
        if (await classifyLegacyDraftFile(filePath) === kind) fileSet.add(filePath);
      }
    } catch (error) {
      throw error;
    }
  }
  return [...fileSet].sort((left, right) => left.localeCompare(right));
}

async function listDraftFiles(kind: DraftStorageKind): Promise<string[]> {
  const typed = await listTypedDraftFiles(kind);
  const typedIds = new Set(typed.map((filePath) => basenameId(filePath)));
  return [
    ...typed,
    ...await listLegacyDraftFiles(kind, typedIds),
  ];
}

async function readAllDrafts(): Promise<V3DraftRecord[]> {
  const files = await listDraftFiles("cashflow");
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

export async function getLatestCashflowDraftSummary(): Promise<V3DraftSummary | null> {
  assertServerOnly();
  const rows = await readAllDrafts();
  return rows[0]?.summary ?? null;
}

export async function getDraft(id: string): Promise<V3DraftRecord | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const primary = await readDraftFromPath(resolveDraftPath(safeId));
  if (primary) return primary;
  const legacyCandidates = [
    resolveLegacyPrimaryDraftPath(safeId),
    resolveLegacySecondaryDraftPath(safeId),
  ];
  for (const candidate of legacyCandidates) {
    const parsed = await readJsonFile(candidate);
    if (parsed.kind === "not-found") continue;
    if (classifyLegacyPayload(parsed.value) !== "cashflow") continue;
    return readDraftFromPath(candidate);
  }
  return null;
}

export async function deleteDraft(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const targets = [
    resolveDraftPath(safeId),
    resolveLegacyPrimaryDraftPath(safeId),
    resolveLegacySecondaryDraftPath(safeId),
  ];

  let deleted = false;
  for (const target of targets) {
    try {
      if (target !== resolveDraftPath(safeId)) {
        const parsed = await readJsonFile(target);
        if (parsed.kind === "not-found" || classifyLegacyPayload(parsed.value) !== "cashflow") continue;
      }
      await fs.unlink(target);
      deleted = true;
    } catch (error) {
      if (!isStorageNotFoundError(error)) throw toStorageReadError(error, target);
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
    const parsed = await readJsonFile(filePath);
    if (parsed.kind === "not-found") return null;
    const draft = normalizeProfileDraftRecord(parsed.value);
    if (!draft) throw storageSchemaCorrupted(filePath, "profile draft storage schema is invalid");
    return draft;
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) {
      throw error;
    }
    throw error;
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
  await atomicWriteJson(resolveProfileDraftPath(record.id), toOrderedProfileDraftRecord(record));
  return record;
}

export async function listProfileDrafts(): Promise<DraftProfileRecord[]> {
  assertServerOnly();
  const files = await listDraftFiles("profile");
  const rows = (await Promise.all(files.map((filePath) => readProfileDraftFromPath(filePath))))
    .filter((row): row is DraftProfileRecord => row !== null);
  return sortProfileDrafts(rows);
}

export async function getProfileDraft(id: string): Promise<DraftProfileRecord | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const primary = await readProfileDraftFromPath(resolveProfileDraftPath(safeId));
  if (primary) return primary;
  const legacyCandidates = [
    resolveLegacyPrimaryDraftPath(safeId),
    resolveLegacySecondaryDraftPath(safeId),
  ];
  for (const candidate of legacyCandidates) {
    const parsed = await readJsonFile(candidate);
    if (parsed.kind === "not-found") continue;
    if (classifyLegacyPayload(parsed.value) !== "profile") continue;
    return readProfileDraftFromPath(candidate);
  }
  return null;
}

export async function deleteProfileDraft(id: string): Promise<{ deleted: boolean }> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const targets = [
    resolveProfileDraftPath(safeId),
    resolveLegacyPrimaryDraftPath(safeId),
    resolveLegacySecondaryDraftPath(safeId),
  ];

  let deleted = false;
  for (const target of targets) {
    try {
      if (target !== resolveProfileDraftPath(safeId)) {
        const parsed = await readJsonFile(target);
        if (parsed.kind === "not-found" || classifyLegacyPayload(parsed.value) !== "profile") continue;
      }
      await fs.unlink(target);
      deleted = true;
    } catch (error) {
      if (!isStorageNotFoundError(error)) throw toStorageReadError(error, target);
      continue;
    }
  }
  return { deleted };
}

export type DraftBoundaryMigrationItem = {
  id: string;
  kind: DraftStorageKind | "ambiguous";
  status: "candidate" | "migrated" | "quarantined" | "rolled-back" | "skipped" | "failed";
  reason: string;
  sourcePath: string;
  targetPath?: string;
  backupPath?: string;
};

export type DraftBoundaryMigrationReport = {
  version: 1;
  mode: "dry-run" | "apply" | "rollback";
  dryRun: boolean;
  generatedAt: string;
  summary: {
    scanned: number;
    candidates: number;
    migrated: number;
    rolledBack: number;
    quarantined: number;
    skipped: number;
    failed: number;
    backupsWritten: number;
  };
  items: DraftBoundaryMigrationItem[];
};

type DraftBoundaryMigrationBackup = {
  version: 1;
  id: string;
  kind: DraftStorageKind | "ambiguous";
  originalPath: string;
  targetPath?: string;
  quarantinePath?: string;
  backedUpAt: string;
  payload: unknown;
};

function basenameId(filePath: string): string {
  return sanitizeRecordId(path.basename(filePath, ".json"));
}

function sourcePrefix(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (resolved.startsWith(path.resolve(resolveLegacyDraftsDir()))) return "legacy";
  return "primary";
}

function resolveMigrationBackupPath(filePath: string): string {
  return path.join(resolveDraftMigrationBackupDir(), `${sourcePrefix(filePath)}_${basenameId(filePath)}.json`);
}

function resolveMigrationTargetPath(kind: DraftStorageKind, id: string): string {
  return kind === "cashflow" ? resolveDraftPath(id) : resolveProfileDraftPath(id);
}

function resolveMigrationQuarantinePath(filePath: string): string {
  return path.join(resolveDraftQuarantineDir(), `${sourcePrefix(filePath)}_${basenameId(filePath)}.json`);
}

function classifyMigrationPayload(filePath: string, payload: unknown): {
  id: string;
  kind: DraftStorageKind | "ambiguous";
} {
  let id = basenameId(filePath);
  if (isRecord(payload)) {
    try {
      id = sanitizeRecordId(payload.id);
    } catch {
      id = basenameId(filePath);
    }
  }
  return {
    id,
    kind: classifyLegacyPayload(payload) ?? "ambiguous",
  };
}

async function listMigrationSourceFiles(): Promise<string[]> {
  return [
    ...await listFlatDraftFiles(resolveDraftsDir()),
    ...await listFlatDraftFiles(resolveLegacyDraftsDir()),
  ].sort((left, right) => left.localeCompare(right));
}

async function readMigrationBackup(filePath: string): Promise<DraftBoundaryMigrationBackup | null> {
  const parsed = await readJsonFile(filePath);
  if (parsed.kind === "not-found") return null;
  if (!isRecord(parsed.value)) return null;
  const id = asString(parsed.value.id);
  const kindRaw = asString(parsed.value.kind);
  const originalPath = asString(parsed.value.originalPath);
  const backedUpAt = asString(parsed.value.backedUpAt);
  if (!id || !originalPath || !backedUpAt || Number(parsed.value.version) !== 1) return null;
  const kind: DraftBoundaryMigrationBackup["kind"] = kindRaw === "cashflow" || kindRaw === "profile" ? kindRaw : "ambiguous";
  return {
    version: 1,
    id,
    kind,
    originalPath,
    ...(asString(parsed.value.targetPath) ? { targetPath: asString(parsed.value.targetPath) } : {}),
    ...(asString(parsed.value.quarantinePath) ? { quarantinePath: asString(parsed.value.quarantinePath) } : {}),
    backedUpAt,
    payload: parsed.value.payload,
  };
}

function summarizeMigrationItems(items: DraftBoundaryMigrationItem[]): DraftBoundaryMigrationReport["summary"] {
  return {
    scanned: items.length,
    candidates: items.filter((item) => item.status === "candidate").length,
    migrated: items.filter((item) => item.status === "migrated").length,
    rolledBack: items.filter((item) => item.status === "rolled-back").length,
    quarantined: items.filter((item) => item.status === "quarantined").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    failed: items.filter((item) => item.status === "failed").length,
    backupsWritten: items.filter((item) => item.status === "migrated" || item.status === "quarantined").length,
  };
}

async function migrateOneLegacyDraft(filePath: string): Promise<DraftBoundaryMigrationItem> {
  const parsed = await readJsonFile(filePath);
  if (parsed.kind === "not-found") {
    return {
      id: basenameId(filePath),
      kind: "ambiguous",
      status: "skipped",
      reason: "source-missing",
      sourcePath: filePath,
    };
  }
  const classified = classifyMigrationPayload(filePath, parsed.value);
  const backupPath = resolveMigrationBackupPath(filePath);
  const targetPath = classified.kind === "ambiguous"
    ? resolveMigrationQuarantinePath(filePath)
    : resolveMigrationTargetPath(classified.kind, classified.id);
  const backup: DraftBoundaryMigrationBackup = {
    version: 1,
    id: classified.id,
    kind: classified.kind,
    originalPath: filePath,
    ...(classified.kind === "ambiguous" ? { quarantinePath: targetPath } : { targetPath }),
    backedUpAt: new Date().toISOString(),
    payload: parsed.value,
  };
  await atomicWriteJson(backupPath, backup);
  await atomicWriteJson(targetPath, parsed.value);
  await fs.unlink(filePath).catch((error) => {
    if (!isStorageNotFoundError(error)) throw toStorageReadError(error, filePath);
  });
  return {
    id: classified.id,
    kind: classified.kind,
    status: classified.kind === "ambiguous" ? "quarantined" : "migrated",
    reason: classified.kind === "ambiguous" ? "ambiguous-legacy-draft" : "legacy-draft-migrated",
    sourcePath: filePath,
    targetPath,
    backupPath,
  };
}

async function rollbackOneDraftMigration(backupPath: string): Promise<DraftBoundaryMigrationItem> {
  const backup = await readMigrationBackup(backupPath);
  if (!backup) {
    return {
      id: basenameId(backupPath),
      kind: "ambiguous",
      status: "skipped",
      reason: "invalid-backup",
      sourcePath: backupPath,
    };
  }
  await atomicWriteJson(backup.originalPath, backup.payload);
  if (backup.targetPath) {
    await fs.unlink(backup.targetPath).catch((error) => {
      if (!isStorageNotFoundError(error)) throw toStorageReadError(error, backup.targetPath ?? "");
    });
  }
  if (backup.quarantinePath) {
    await fs.unlink(backup.quarantinePath).catch((error) => {
      if (!isStorageNotFoundError(error)) throw toStorageReadError(error, backup.quarantinePath ?? "");
    });
  }
  return {
    id: backup.id,
    kind: backup.kind,
    status: "rolled-back",
    reason: "legacy-draft-restored",
    sourcePath: backup.originalPath,
    ...(backup.targetPath ?? backup.quarantinePath ? { targetPath: backup.targetPath ?? backup.quarantinePath } : {}),
    backupPath,
  };
}

export async function migrateDraftStorageBoundaries(options?: {
  dryRun?: boolean;
  rollback?: boolean;
}): Promise<DraftBoundaryMigrationReport> {
  assertServerOnly();
  const dryRun = options?.dryRun !== false;
  const rollback = options?.rollback === true;
  const mode: DraftBoundaryMigrationReport["mode"] = rollback ? "rollback" : dryRun ? "dry-run" : "apply";
  const items: DraftBoundaryMigrationItem[] = [];

  if (rollback) {
    const backups = await listFlatDraftFiles(resolveDraftMigrationBackupDir());
    for (const backupPath of backups) {
      if (dryRun) {
        const backup = await readMigrationBackup(backupPath);
        items.push({
          id: backup?.id ?? basenameId(backupPath),
          kind: backup?.kind ?? "ambiguous",
          status: backup ? "candidate" : "skipped",
          reason: backup ? "rollback-backup-found" : "invalid-backup",
          sourcePath: backup?.originalPath ?? backupPath,
          ...(backup?.targetPath ?? backup?.quarantinePath ? { targetPath: backup.targetPath ?? backup.quarantinePath } : {}),
          backupPath,
        });
      } else {
        items.push(await rollbackOneDraftMigration(backupPath));
      }
    }
  } else {
    const sources = await listMigrationSourceFiles();
    for (const filePath of sources) {
      const parsed = await readJsonFile(filePath);
      if (parsed.kind === "not-found") {
        items.push({
          id: basenameId(filePath),
          kind: "ambiguous",
          status: "skipped",
          reason: "source-missing",
          sourcePath: filePath,
        });
        continue;
      }
      const classified = classifyMigrationPayload(filePath, parsed.value);
      const targetPath = classified.kind === "ambiguous"
        ? resolveMigrationQuarantinePath(filePath)
        : resolveMigrationTargetPath(classified.kind, classified.id);
      if (classified.kind !== "ambiguous" && await fileExists(targetPath)) {
        items.push({
          id: classified.id,
          kind: classified.kind,
          status: "skipped",
          reason: "typed-primary-exists",
          sourcePath: filePath,
          targetPath,
        });
        continue;
      }
      items.push(dryRun
        ? {
          id: classified.id,
          kind: classified.kind,
          status: "candidate",
          reason: classified.kind === "ambiguous" ? "ambiguous-legacy-draft" : "legacy-draft-found",
          sourcePath: filePath,
          targetPath,
        }
        : await migrateOneLegacyDraft(filePath));
    }
  }

  return {
    version: 1,
    mode,
    dryRun,
    generatedAt: new Date().toISOString(),
    summary: summarizeMigrationItems(items),
    items,
  };
}

export function isGenerateDraftInputError(error: unknown): error is GenerateDraftPatchFromBatchError {
  return error instanceof GenerateDraftPatchFromBatchError;
}
