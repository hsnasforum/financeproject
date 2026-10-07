import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../storage/atomicWrite";
import {
  isStorageNotFoundError,
  readJsonFile,
  storageSchemaCorrupted,
  toStorageReadError,
  toStorageWriteError,
} from "../../storage/serverFileRead";
import { withPlanningStoreWriteLock } from "../../storage/storeWriteLock";
import { isPlanningNamespaceEnabled } from "../../store/namespace";
import { sanitizeRecordId } from "../../store/paths";
import { type CategoryId, type TxnOverride } from "../domain/types";
import { isTxnId } from "../service/txnId";
import { resolvePlanningV3DataDir, resolvePlanningV3LegacyDataDir } from "./dataDir";

type OverridesState = {
  version: 1;
  items: Record<string, TxnOverride>;
  hadInvalidItems?: boolean;
};

const LEGACY_BATCH_ID = "legacy";
const ALLOWED_KINDS = new Set<NonNullable<TxnOverride["kind"]>>(["income", "expense", "transfer"]);
const ALLOWED_CATEGORY_IDS = new Set<CategoryId>([
  "income",
  "transfer",
  "fixed",
  "variable",
  "debt",
  "tax",
  "insurance",
  "housing",
  "food",
  "transport",
  "shopping",
  "health",
  "education",
  "etc",
  "unknown",
]);
const LEGACY_CATEGORY_IDS = new Set<Exclude<NonNullable<TxnOverride["category"]>, CategoryId>>(["saving", "invest"]);

export class TxnOverridesStoreInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "TxnOverridesStoreInputError";
    this.details = details;
  }
}

type UpsertLegacyPatch = {
  kind?: unknown;
  category?: unknown;
  categoryId?: unknown;
  note?: unknown;
};

type UpsertBatchInput = {
  batchId: unknown;
  txnId: unknown;
  kind?: unknown;
  categoryId?: unknown;
  note?: unknown;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 transaction overrides store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveLegacyOverridesPath(cwd = process.cwd()): string {
  if (isPlanningNamespaceEnabled()) return path.join(resolvePlanningV3LegacyDataDir(cwd), "txn-overrides.json");

  const override = asString(process.env.PLANNING_V3_TXN_OVERRIDES_PATH);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningV3LegacyDataDir(cwd), "txn-overrides.json");
}

function resolveOverridesDir(cwd = process.cwd()): string {
  if (isPlanningNamespaceEnabled()) return path.join(resolvePlanningV3DataDir(cwd), "txn-overrides");

  const override = asString(process.env.PLANNING_V3_TXN_OVERRIDES_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningV3DataDir(cwd), "txn-overrides");
}

function resolveBatchOverridesPath(batchId: string, cwd = process.cwd()): string {
  return path.join(resolveOverridesDir(cwd), `${normalizeBatchId(batchId)}.json`);
}

function normalizeBatchId(value: unknown): string {
  const text = asString(value);
  if (!text) {
    throw new TxnOverridesStoreInputError("invalid batchId", [
      { field: "batchId", message: "batchId가 필요합니다." },
    ]);
  }
  try {
    return sanitizeRecordId(text);
  } catch {
    throw new TxnOverridesStoreInputError("invalid batchId", [
      { field: "batchId", message: "batchId 형식이 올바르지 않습니다." },
    ]);
  }
}

function normalizeTxnId(value: unknown): string {
  const txnId = asString(value).toLowerCase();
  if (!isTxnId(txnId)) {
    throw new TxnOverridesStoreInputError("invalid txnId", [
      { field: "txnId", message: "거래 식별자(txnId)가 올바르지 않습니다." },
    ]);
  }
  return txnId;
}

function normalizeKind(value: unknown): NonNullable<TxnOverride["kind"]> | undefined {
  const kind = asString(value).toLowerCase();
  if (!kind) return undefined;
  if (!ALLOWED_KINDS.has(kind as NonNullable<TxnOverride["kind"]>)) {
    throw new TxnOverridesStoreInputError("invalid kind", [
      { field: "kind", message: "kind 값이 올바르지 않습니다." },
    ]);
  }
  return kind as NonNullable<TxnOverride["kind"]>;
}

function normalizeCategoryId(value: unknown): CategoryId | undefined {
  const categoryId = asString(value).toLowerCase() as CategoryId;
  if (!categoryId) return undefined;
  if (!ALLOWED_CATEGORY_IDS.has(categoryId)) {
    throw new TxnOverridesStoreInputError("invalid categoryId", [
      { field: "categoryId", message: "categoryId 값이 올바르지 않습니다." },
    ]);
  }
  return categoryId;
}

function normalizeLegacyCategory(value: unknown): NonNullable<TxnOverride["category"]> | undefined {
  const category = asString(value).toLowerCase();
  if (!category) return undefined;
  if (ALLOWED_CATEGORY_IDS.has(category as CategoryId)) {
    return category as NonNullable<TxnOverride["category"]>;
  }
  if (LEGACY_CATEGORY_IDS.has(category as "saving" | "invest")) {
    return category as NonNullable<TxnOverride["category"]>;
  }
  throw new TxnOverridesStoreInputError("invalid category", [
    { field: "category", message: "category 값이 올바르지 않습니다." },
  ]);
}

function parseIso(value: unknown): string {
  const raw = asString(value);
  const timestamp = Date.parse(raw);
  if (!raw || !Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString();
}

function sortedObject<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, T>;
}

function normalizeOverride(value: unknown, fallbackBatchId: string): TxnOverride | null {
  if (!isRecord(value)) return null;
  try {
    const txnId = normalizeTxnId(value.txnId);
    const batchId = asString(value.batchId) ? normalizeBatchId(value.batchId) : fallbackBatchId;
    const updatedAt = parseIso(value.updatedAt);
    if (!updatedAt) return null;
    const kind = normalizeKind(value.kind);
    const category = normalizeLegacyCategory(value.category);
    const categoryId = normalizeCategoryId(value.categoryId) ?? (
      category && ALLOWED_CATEGORY_IDS.has(category as CategoryId)
        ? category as CategoryId
        : undefined
    );
    const note = asString(value.note);
    if (!kind && !category && !categoryId) return null;

    return {
      batchId,
      txnId,
      ...(kind ? { kind } : {}),
      ...(category ? { category } : {}),
      ...(categoryId ? { categoryId } : {}),
      updatedAt,
      ...(note ? { note: note.slice(0, 120) } : {}),
    };
  } catch {
    return null;
  }
}

function parseState(
  parsed: unknown,
  filePath: string,
  fallbackBatchId: string,
  forceBatchId?: string,
): OverridesState {
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.items)) {
    throw storageSchemaCorrupted(filePath, "transaction overrides storage schema is invalid");
  }

  const normalized: Record<string, TxnOverride> = {};
  let hadInvalidItems = false;
  for (const [txnId, row] of Object.entries(parsed.items)) {
    const candidate = normalizeOverride(
      isRecord(row)
        ? { ...row, txnId, ...(forceBatchId ? { batchId: forceBatchId } : {}) }
        : null,
      fallbackBatchId,
    );
    if (!candidate) {
      hadInvalidItems = true;
      continue;
    }
    normalized[candidate.txnId] = candidate;
  }
  return {
    version: 1,
    items: sortedObject(normalized),
    ...(hadInvalidItems ? { hadInvalidItems: true } : {}),
  };
}

async function readBatchState(
  batchId: string,
  filePath = resolveBatchOverridesPath(batchId),
): Promise<OverridesState> {
  const safeBatchId = normalizeBatchId(batchId);
  const loaded = await readJsonFile(filePath);
  if (loaded.kind === "not-found") return { version: 1, items: {} };
  return parseState(loaded.value, filePath, safeBatchId, safeBatchId);
}

async function writeBatchState(filePath: string, state: OverridesState): Promise<void> {
  try {
    await atomicWriteJson(filePath, {
      version: 1,
      items: sortedObject(state.items),
    });
  } catch (error) {
    throw toStorageWriteError(error, filePath);
  }
}

async function readLegacyState(filePath = resolveLegacyOverridesPath()): Promise<OverridesState> {
  const loaded = await readJsonFile(filePath);
  if (loaded.kind === "not-found") return { version: 1, items: {} };
  return parseState(loaded.value, filePath, LEGACY_BATCH_ID);
}

async function writeLegacyState(filePath: string, state: OverridesState): Promise<void> {
  try {
    await atomicWriteJson(filePath, {
      version: 1,
      items: sortedObject(state.items),
    });
  } catch (error) {
    throw toStorageWriteError(error, filePath);
  }
}

function withTxnOverridesWriteLock<T>(filePath: string, callback: () => Promise<T> | T): Promise<T> {
  return withPlanningStoreWriteLock(`planning-v3:txn-overrides:${filePath}`, callback);
}

// Batch-scoped override owner. User-facing reads/writes should stay on this surface.
export async function getBatchTxnOverrides(batchId: unknown): Promise<Record<string, TxnOverride>> {
  assertServerOnly();
  const safeBatchId = normalizeBatchId(batchId);
  const state = await readBatchState(safeBatchId);
  return sortedObject(state.items);
}

export async function deleteBatchTxnOverrides(batchId: unknown): Promise<void> {
  assertServerOnly();
  const safeBatchId = normalizeBatchId(batchId);
  const filePath = resolveBatchOverridesPath(safeBatchId);
  await withTxnOverridesWriteLock(filePath, async () => {
    const state = await readBatchState(safeBatchId, filePath);
    if (state.hadInvalidItems) {
      throw storageSchemaCorrupted(filePath, "transaction overrides storage contains invalid items");
    }
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (!isStorageNotFoundError(error)) throw toStorageWriteError(error, filePath);
    }
  });
}

export async function restoreBatchTxnOverrides(
  batchId: unknown,
  snapshot: Readonly<Record<string, TxnOverride>>,
): Promise<void> {
  assertServerOnly();
  if (Object.keys(snapshot).length === 0) return;
  const safeBatchId = normalizeBatchId(batchId);
  const filePath = resolveBatchOverridesPath(safeBatchId);
  await withTxnOverridesWriteLock(filePath, async () => {
    const state = await readBatchState(safeBatchId, filePath);
    if (state.hadInvalidItems) {
      throw storageSchemaCorrupted(filePath, "transaction overrides storage contains invalid items");
    }
    await writeBatchState(filePath, {
      version: 1,
      items: sortedObject({ ...snapshot, ...state.items }),
    });
  });
}

// Legacy unscoped bridge / internal-dev path.
export async function listLegacyUnscopedTxnOverrides(): Promise<Record<string, TxnOverride>> {
  assertServerOnly();
  const state = await readLegacyState();
  return sortedObject(state.items);
}

async function listAllBatchOverrideFiles(): Promise<string[]> {
  const overridesDir = resolveOverridesDir();
  try {
    const names = await fs.readdir(overridesDir);
    return names
      .filter((name) => name.endsWith(".json"))
      .map((name) => path.join(overridesDir, name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isStorageNotFoundError(error)) return [];
    throw toStorageReadError(error, overridesDir);
  }
}

async function readBatchStateByFile(filePath: string): Promise<OverridesState> {
  const batchId = path.basename(filePath, ".json");
  return readBatchState(batchId);
}

// Internal/dev merged bridge helper. User-facing reads should not rely on this.
export async function listInternalBridgeTxnOverrides(): Promise<Record<string, TxnOverride>> {
  assertServerOnly();
  const merged: Record<string, TxnOverride> = {};

  const batchFiles = await listAllBatchOverrideFiles();
  for (const filePath of batchFiles) {
    const state = await readBatchStateByFile(filePath);
    for (const row of Object.values(state.items)) {
      merged[row.txnId] = row;
    }
  }

  const legacy = await readLegacyState();
  for (const row of Object.values(legacy.items)) {
    if (!merged[row.txnId]) {
      merged[row.txnId] = row;
    }
  }

  return sortedObject(merged);
}

// Backward-compatible aliases for existing callers while the bridge boundary is narrowed.
export const getOverrides = getBatchTxnOverrides;
export const listLegacyOverrides = listLegacyUnscopedTxnOverrides;
export const listOverrides = listInternalBridgeTxnOverrides;

export async function upsertOverride(input: UpsertBatchInput): Promise<TxnOverride>;
export async function upsertOverride(txnId: unknown, patch: UpsertLegacyPatch): Promise<TxnOverride>;
export async function upsertOverride(
  arg1: UpsertBatchInput | unknown,
  arg2?: UpsertLegacyPatch,
): Promise<TxnOverride> {
  assertServerOnly();

  if (isRecord(arg1) && arg2 === undefined) {
    const batchId = normalizeBatchId(arg1.batchId);
    const txnId = normalizeTxnId(arg1.txnId);
    const kind = normalizeKind(arg1.kind);
    const categoryId = normalizeCategoryId(arg1.categoryId);
    if (!kind && !categoryId) {
      throw new TxnOverridesStoreInputError("empty override patch", [
        { field: "override", message: "kind/categoryId 중 하나 이상 필요합니다." },
      ]);
    }

    const filePath = resolveBatchOverridesPath(batchId);
    return withTxnOverridesWriteLock(filePath, async () => {
      const state = await readBatchState(batchId, filePath);
      if (state.hadInvalidItems) {
        throw storageSchemaCorrupted(filePath, "transaction overrides storage contains invalid items");
      }
      const current = state.items[txnId];
      const note = asString(arg1.note);
      const next: TxnOverride = {
        batchId,
        txnId,
        ...(kind ? { kind } : (current?.kind ? { kind: current.kind } : {})),
        ...(categoryId ? { categoryId } : (current?.categoryId ? { categoryId: current.categoryId } : {})),
        ...(categoryId
          ? { category: categoryId }
          : (current?.category ? { category: current.category } : {})),
        updatedAt: new Date().toISOString(),
        ...(note ? { note: note.slice(0, 120) } : (current?.note ? { note: current.note } : {})),
      };

      state.items[txnId] = next;
      await writeBatchState(filePath, state);
      return next;
    });
  }

  const txnId = normalizeTxnId(arg1);
  const kind = normalizeKind(arg2?.kind);
  const category = normalizeLegacyCategory(arg2?.category);
  const categoryId = normalizeCategoryId(arg2?.categoryId) ?? (
    category && ALLOWED_CATEGORY_IDS.has(category as CategoryId) ? category as CategoryId : undefined
  );
  const note = asString(arg2?.note);

  if (!kind && !category && !categoryId) {
    throw new TxnOverridesStoreInputError("empty override patch", [
      { field: "override", message: "kind/category/categoryId 중 하나 이상 필요합니다." },
    ]);
  }

  const filePath = resolveLegacyOverridesPath();
  return withTxnOverridesWriteLock(filePath, async () => {
    const state = await readLegacyState(filePath);
    if (state.hadInvalidItems) {
      throw storageSchemaCorrupted(filePath, "transaction overrides storage contains invalid items");
    }
    const current = state.items[txnId];
    const next: TxnOverride = {
      batchId: LEGACY_BATCH_ID,
      txnId,
      ...(kind ? { kind } : (current?.kind ? { kind: current.kind } : {})),
      ...(category ? { category } : (current?.category ? { category: current.category } : {})),
      ...(categoryId ? { categoryId } : (current?.categoryId ? { categoryId: current.categoryId } : {})),
      updatedAt: new Date().toISOString(),
      ...(note ? { note: note.slice(0, 120) } : (current?.note ? { note: current.note } : {})),
    };
    state.items[txnId] = next;
    await writeLegacyState(filePath, state);
    return next;
  });
}

export async function deleteOverride(input: { batchId: unknown; txnId: unknown }): Promise<void>;
export async function deleteOverride(txnId: unknown): Promise<void>;
export async function deleteOverride(arg1: { batchId: unknown; txnId: unknown } | unknown): Promise<void> {
  assertServerOnly();

  if (isRecord(arg1) && arg1.batchId !== undefined) {
    const batchId = normalizeBatchId(arg1.batchId);
    const txnId = normalizeTxnId(arg1.txnId);
    const filePath = resolveBatchOverridesPath(batchId);
    await withTxnOverridesWriteLock(filePath, async () => {
      const state = await readBatchState(batchId, filePath);
      if (state.hadInvalidItems) {
        throw storageSchemaCorrupted(filePath, "transaction overrides storage contains invalid items");
      }
      if (!(txnId in state.items)) return;
      delete state.items[txnId];
      await writeBatchState(filePath, state);
    });
    return;
  }

  const txnId = normalizeTxnId(arg1);
  const filePath = resolveLegacyOverridesPath();
  await withTxnOverridesWriteLock(filePath, async () => {
    const legacy = await readLegacyState(filePath);
    if (legacy.hadInvalidItems) {
      throw storageSchemaCorrupted(filePath, "transaction overrides storage contains invalid items");
    }
    if (txnId in legacy.items) {
      delete legacy.items[txnId];
      await writeLegacyState(filePath, legacy);
    }
  });
}

export async function upsertBatchTxnOverride(input: UpsertBatchInput): Promise<TxnOverride> {
  return upsertOverride(input);
}

export async function upsertLegacyUnscopedTxnOverride(
  txnId: unknown,
  patch: UpsertLegacyPatch,
): Promise<TxnOverride> {
  return upsertOverride(txnId, patch);
}

export async function deleteBatchTxnOverride(input: { batchId: unknown; txnId: unknown }): Promise<void> {
  await deleteOverride(input);
}

export async function deleteLegacyUnscopedTxnOverride(txnId: unknown): Promise<void> {
  await deleteOverride(txnId);
}
