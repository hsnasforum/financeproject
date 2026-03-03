import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolveDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "../service/forbiddenDraftKeys";

export type CsvDraft = {
  cashflow: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
  draftPatch: Record<string, unknown>;
};

export type DraftV1 = {
  id: string;
  createdAt: string;
  source: {
    kind: "csv";
    filename?: string;
    sha256?: string;
  };
  payload: CsvDraft;
  meta: {
    rows: number;
    columns: number;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ensureServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 drafts store is server-only.");
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveDraftsDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_DRAFTS_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolveDataDir({ cwd }), "planning_v3_drafts");
}

function resolveDraftPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveDraftsDir(cwd), `${sanitizeRecordId(id)}.json`);
}

function normalizeSource(value: unknown): DraftV1["source"] {
  if (!isRecord(value) || value.kind !== "csv") {
    return { kind: "csv" };
  }
  const filename = asString(value.filename);
  const sha256 = asString(value.sha256).toLowerCase();
  const normalizedHash = /^[a-f0-9]{8,64}$/u.test(sha256) ? sha256 : "";
  return {
    kind: "csv",
    ...(filename ? { filename: filename.slice(0, 255) } : {}),
    ...(normalizedHash ? { sha256: normalizedHash } : {}),
  };
}

function normalizeCashflow(value: unknown): CsvDraft["cashflow"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!isRecord(row)) return null;
      const ym = asString(row.ym);
      if (!/^\d{4}-\d{2}$/u.test(ym)) return null;
      return {
        ym,
        incomeKrw: asNumber(row.incomeKrw),
        expenseKrw: asNumber(row.expenseKrw),
        netKrw: asNumber(row.netKrw),
        txCount: Math.max(0, asNumber(row.txCount)),
      };
    })
    .filter((row): row is CsvDraft["cashflow"][number] => row !== null)
    .sort((left, right) => left.ym.localeCompare(right.ym));
}

function normalizePayload(value: unknown): CsvDraft {
  if (!isRecord(value)) {
    return {
      cashflow: [],
      draftPatch: {},
    };
  }
  return {
    cashflow: normalizeCashflow(value.cashflow),
    draftPatch: isRecord(value.draftPatch) ? value.draftPatch : {},
  };
}

function normalizeMeta(value: unknown): DraftV1["meta"] {
  if (!isRecord(value)) {
    return { rows: 0, columns: 0 };
  }
  return {
    rows: Math.max(0, asNumber(value.rows)),
    columns: Math.max(0, asNumber(value.columns)),
  };
}

function normalizeDraft(value: unknown): DraftV1 | null {
  if (!isRecord(value)) return null;
  try {
    const id = sanitizeRecordId(value.id);
    const createdAtRaw = asString(value.createdAt);
    const createdAt = Number.isFinite(Date.parse(createdAtRaw))
      ? new Date(createdAtRaw).toISOString()
      : new Date(0).toISOString();
    const draft: DraftV1 = {
      id,
      createdAt,
      source: normalizeSource(value.source),
      payload: normalizePayload(value.payload),
      meta: normalizeMeta(value.meta),
    };
    assertNoForbiddenDraftKeys(draft);
    return draft;
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) throw error;
    return null;
  }
}

function sortByCreatedAtDesc(rows: DraftV1[]): DraftV1[] {
  return [...rows].sort((left, right) => {
    const leftTs = Date.parse(left.createdAt);
    const rightTs = Date.parse(right.createdAt);
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return right.id.localeCompare(left.id);
  });
}

function sanitizeForWrite(value: DraftV1): DraftV1 {
  return {
    id: value.id,
    createdAt: value.createdAt,
    source: value.source,
    payload: value.payload,
    meta: value.meta,
  };
}

async function readDraftFile(filePath: string): Promise<DraftV1 | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
    return normalizeDraft(parsed);
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) throw error;
    return null;
  }
}

async function listDraftFiles(): Promise<string[]> {
  const dir = resolveDraftsDir();
  try {
    const names = await fs.readdir(dir);
    return names
      .filter((name) => name.endsWith(".json"))
      .map((name) => path.join(dir, name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function buildDeterministicSha256(input: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input), "utf-8")
    .digest("hex");
}

export async function createDraft(input: {
  id?: string;
  source?: DraftV1["source"];
  payload: CsvDraft;
  meta: DraftV1["meta"];
}): Promise<DraftV1> {
  ensureServerOnly();
  const id = sanitizeRecordId(asString(input.id) || crypto.randomUUID());
  const payload = normalizePayload(input.payload);
  const source = normalizeSource(input.source);
  const meta = normalizeMeta(input.meta);
  const draft: DraftV1 = {
    id,
    createdAt: nowIso(),
    source: {
      kind: "csv",
      ...(source.filename ? { filename: source.filename } : {}),
      ...(source.sha256 ? { sha256: source.sha256 } : {}),
      ...(!source.sha256 ? { sha256: buildDeterministicSha256(payload).slice(0, 64) } : {}),
    },
    payload,
    meta,
  };
  assertNoForbiddenDraftKeys(draft);
  await atomicWriteJson(resolveDraftPath(id), sanitizeForWrite(draft));
  return draft;
}

export async function listDrafts(): Promise<Array<Pick<DraftV1, "id" | "createdAt" | "source" | "meta">>> {
  ensureServerOnly();
  const files = await listDraftFiles();
  const rows = (await Promise.all(files.map((file) => readDraftFile(file))))
    .filter((row): row is DraftV1 => row !== null);
  return sortByCreatedAtDesc(rows).map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    source: row.source,
    meta: row.meta,
  }));
}

export async function getDraft(id: string): Promise<DraftV1 | null> {
  ensureServerOnly();
  const safeId = sanitizeRecordId(id);
  return readDraftFile(resolveDraftPath(safeId));
}

export async function deleteDraft(id: string): Promise<boolean> {
  ensureServerOnly();
  const safeId = sanitizeRecordId(id);
  try {
    await fs.unlink(resolveDraftPath(safeId));
    return true;
  } catch {
    return false;
  }
}
