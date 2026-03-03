import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { type TxnTransferOverride } from "../domain/types";
import { isTxnId } from "../service/txnId";

type TxnTransferOverridesState = {
  version: 1;
  items: Record<string, TxnTransferOverride>;
};

export class TxnTransferOverridesStoreInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "TxnTransferOverridesStoreInputError";
    this.details = details;
  }
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 transfer overrides store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveOverridesDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_TXN_TRANSFER_OVERRIDES_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "planning-v3", "txn-transfer-overrides");
}

function resolveOverridesPath(batchId: string, cwd = process.cwd()): string {
  return path.join(resolveOverridesDir(cwd), `${sanitizeRecordId(batchId)}.json`);
}

function normalizeBatchId(value: unknown): string {
  const raw = asString(value);
  if (!raw) {
    throw new TxnTransferOverridesStoreInputError("invalid batchId", [
      { field: "batchId", message: "batchId가 필요합니다." },
    ]);
  }
  try {
    return sanitizeRecordId(raw);
  } catch {
    throw new TxnTransferOverridesStoreInputError("invalid batchId", [
      { field: "batchId", message: "batchId 형식이 올바르지 않습니다." },
    ]);
  }
}

function normalizeTxnId(value: unknown): string {
  const raw = asString(value).toLowerCase();
  if (!isTxnId(raw)) {
    throw new TxnTransferOverridesStoreInputError("invalid txnId", [
      { field: "txnId", message: "txnId 형식이 올바르지 않습니다." },
    ]);
  }
  return raw;
}

function parseIso(value: unknown): string {
  const raw = asString(value);
  const ts = Date.parse(raw);
  if (!raw || !Number.isFinite(ts)) return "";
  return new Date(ts).toISOString();
}

function sortedObject<T>(items: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(items).sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, T>;
}

function normalizeRow(value: unknown, batchId: string): TxnTransferOverride | null {
  if (!isRecord(value)) return null;
  try {
    const txnId = normalizeTxnId(value.txnId);
    const forceTransfer = asBoolean(value.forceTransfer);
    const forceNonTransfer = asBoolean(value.forceNonTransfer);
    if (forceTransfer && forceNonTransfer) return null;
    if (!forceTransfer && !forceNonTransfer) return null;
    const updatedAt = parseIso(value.updatedAt);
    if (!updatedAt) return null;
    const note = asString(value.note);
    return {
      batchId,
      txnId,
      ...(forceTransfer ? { forceTransfer: true } : {}),
      ...(forceNonTransfer ? { forceNonTransfer: true } : {}),
      updatedAt,
      ...(note ? { note: note.slice(0, 120) } : {}),
    };
  } catch {
    return null;
  }
}

async function readState(batchId: string): Promise<TxnTransferOverridesState> {
  const safeBatchId = normalizeBatchId(batchId);
  try {
    const parsed = JSON.parse(await fs.readFile(resolveOverridesPath(safeBatchId), "utf-8")) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.items)) {
      return { version: 1, items: {} };
    }
    const normalized: Record<string, TxnTransferOverride> = {};
    for (const [txnId, row] of Object.entries(parsed.items)) {
      const candidate = normalizeRow(isRecord(row) ? { ...row, txnId } : null, safeBatchId);
      if (!candidate) continue;
      normalized[candidate.txnId] = candidate;
    }
    return {
      version: 1,
      items: sortedObject(normalized),
    };
  } catch {
    return { version: 1, items: {} };
  }
}

async function writeState(batchId: string, state: TxnTransferOverridesState): Promise<void> {
  const safeBatchId = normalizeBatchId(batchId);
  await atomicWriteJson(resolveOverridesPath(safeBatchId), {
    version: 1,
    items: sortedObject(state.items),
  });
}

export async function getTransferOverrides(batchId: unknown): Promise<Record<string, TxnTransferOverride>> {
  assertServerOnly();
  const safeBatchId = normalizeBatchId(batchId);
  const state = await readState(safeBatchId);
  return sortedObject(state.items);
}

export async function upsertTransferOverride(input: {
  batchId: unknown;
  txnId: unknown;
  forceTransfer?: unknown;
  forceNonTransfer?: unknown;
  note?: unknown;
}): Promise<TxnTransferOverride> {
  assertServerOnly();

  const batchId = normalizeBatchId(input.batchId);
  const txnId = normalizeTxnId(input.txnId);
  const forceTransfer = asBoolean(input.forceTransfer);
  const forceNonTransfer = asBoolean(input.forceNonTransfer);
  if (forceTransfer && forceNonTransfer) {
    throw new TxnTransferOverridesStoreInputError("conflict override", [
      { field: "forceTransfer", message: "forceTransfer와 forceNonTransfer를 동시에 true로 설정할 수 없습니다." },
    ]);
  }
  if (!forceTransfer && !forceNonTransfer) {
    throw new TxnTransferOverridesStoreInputError("empty override", [
      { field: "override", message: "forceTransfer 또는 forceNonTransfer 중 하나가 필요합니다." },
    ]);
  }

  const state = await readState(batchId);
  const note = asString(input.note);
  const next: TxnTransferOverride = {
    batchId,
    txnId,
    ...(forceTransfer ? { forceTransfer: true } : {}),
    ...(forceNonTransfer ? { forceNonTransfer: true } : {}),
    updatedAt: new Date().toISOString(),
    ...(note ? { note: note.slice(0, 120) } : {}),
  };
  state.items[txnId] = next;
  await writeState(batchId, state);
  return next;
}
