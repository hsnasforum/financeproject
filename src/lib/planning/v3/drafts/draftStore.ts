import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolveDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import {
  DraftRecordSchema,
  DraftSourceSchema,
  normalizeDraftMeta,
  normalizeDraftPayload,
  normalizeDraftSource,
  type DraftMeta,
  type DraftPatch,
  type DraftRecord,
  type DraftSource,
} from "./draftSchema";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "../service/forbiddenDraftKeys";

export type CsvDraft = {
  monthlyCashflow: DraftRecord["monthlyCashflow"];
  draftPatch: DraftPatch;
};

export type DraftV1 = DraftRecord;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

let droppedDraftPayloadWarningCount = 0;

function recordDroppedDraftPayloadWarnings(count: number): void {
  if (count > 0) {
    droppedDraftPayloadWarningCount += count;
  }
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

function normalizePayloadFromRecord(value: unknown): ReturnType<typeof normalizeDraftPayload> {
  if (isRecord(value) && isRecord(value.payload)) {
    return normalizeDraftPayload(value.payload);
  }
  return normalizeDraftPayload({
    monthlyCashflow: isRecord(value) ? value.monthlyCashflow : undefined,
    draftPatch: isRecord(value) ? value.draftPatch : undefined,
  });
}

function normalizeDraft(value: unknown): DraftV1 | null {
  if (!isRecord(value)) return null;
  try {
    const id = sanitizeRecordId(value.id);
    const createdAtRaw = asString(value.createdAt);
    const createdAt = Number.isFinite(Date.parse(createdAtRaw))
      ? new Date(createdAtRaw).toISOString()
      : new Date(0).toISOString();
    const sourceNormalized = normalizeDraftSource(value.source);
    const payloadNormalized = normalizePayloadFromRecord(value);
    const allowedTopKeys = new Set([
      "id",
      "createdAt",
      "source",
      "meta",
      "monthlyCashflow",
      "draftPatch",
      "payload",
    ]);
    const droppedByTopLevel = Object.keys(value).filter((key) => !allowedTopKeys.has(key)).length;
    const droppedWarnings = sourceNormalized.droppedWarnings + payloadNormalized.droppedWarnings + droppedByTopLevel;
    recordDroppedDraftPayloadWarnings(droppedWarnings);

    const draft: DraftV1 = {
      id,
      createdAt,
      source: sourceNormalized.value,
      meta: normalizeDraftMeta(value.meta, droppedWarnings),
      monthlyCashflow: payloadNormalized.value.monthlyCashflow,
      draftPatch: payloadNormalized.value.draftPatch,
    };
    DraftRecordSchema.parse(draft);
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
    meta: value.meta,
    monthlyCashflow: value.monthlyCashflow,
    draftPatch: value.draftPatch,
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
  source?: DraftSource;
  payload?: {
    monthlyCashflow?: unknown;
    cashflow?: unknown;
    draftPatch?: unknown;
  };
  monthlyCashflow?: unknown;
  draftPatch?: unknown;
  meta?: Partial<DraftMeta> & {
    rows?: unknown;
    columns?: unknown;
  };
}): Promise<DraftV1> {
  ensureServerOnly();
  const id = sanitizeRecordId(asString(input.id) || crypto.randomUUID());
  const allowedInputKeys = new Set(["id", "source", "payload", "monthlyCashflow", "draftPatch", "meta"]);
  const droppedByInputTopLevel = Object.keys(input).filter((key) => !allowedInputKeys.has(key)).length;
  const sourceNormalized = normalizeDraftSource(input.source);
  const payloadNormalized = normalizeDraftPayload(
    isRecord(input.payload)
      ? input.payload
      : {
        monthlyCashflow: input.monthlyCashflow,
        draftPatch: input.draftPatch,
      },
  );
  const droppedWarnings = droppedByInputTopLevel + sourceNormalized.droppedWarnings + payloadNormalized.droppedWarnings;
  const source = sourceNormalized.value;
  const payload = payloadNormalized.value;
  const meta = normalizeDraftMeta(input.meta, droppedWarnings);
  recordDroppedDraftPayloadWarnings(droppedWarnings);

  const draft: DraftV1 = {
    id,
    createdAt: nowIso(),
    source: DraftSourceSchema.parse({
      kind: "csv",
      ...(source.filename ? { filename: source.filename } : {}),
      ...(source.sha256 ? { sha256: source.sha256 } : {}),
      ...(!source.sha256 ? { sha256: buildDeterministicSha256(payload).slice(0, 64) } : {}),
    }),
    meta,
    monthlyCashflow: payload.monthlyCashflow,
    draftPatch: payload.draftPatch,
  };
  const parsedDraft = DraftRecordSchema.parse(draft);
  const normalizedDraft: DraftV1 = {
    id: parsedDraft.id,
    createdAt: parsedDraft.createdAt,
    source: parsedDraft.source,
    meta: parsedDraft.meta,
    monthlyCashflow: parsedDraft.monthlyCashflow,
    draftPatch: parsedDraft.draftPatch,
  };
  assertNoForbiddenDraftKeys(normalizedDraft);
  await atomicWriteJson(resolveDraftPath(id), sanitizeForWrite(normalizedDraft));
  return normalizedDraft;
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
