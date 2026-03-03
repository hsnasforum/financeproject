import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { isTxnId } from "../service/txnId";
import { type TxnOverride } from "../domain/types";

type TxnOverrideKind = NonNullable<TxnOverride["kind"]>;
type TxnOverrideCategory = NonNullable<TxnOverride["category"]>;

type TxnOverridesStoreState = {
  version: 1;
  items: Record<string, TxnOverride>;
};

const ALLOWED_KINDS = new Set<TxnOverrideKind>(["income", "expense", "transfer"]);
const ALLOWED_CATEGORIES = new Set<TxnOverrideCategory>(["fixed", "variable", "saving", "invest", "unknown"]);

export class TxnOverridesStoreInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "TxnOverridesStoreInputError";
    this.details = details;
  }
}

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

function resolveOverridesPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_TXN_OVERRIDES_PATH);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "v3", "txn-overrides.json");
}

function normalizeKind(value: unknown): TxnOverrideKind | undefined {
  const kind = asString(value).toLowerCase();
  if (!kind) return undefined;
  if (!ALLOWED_KINDS.has(kind as TxnOverrideKind)) {
    throw new TxnOverridesStoreInputError("invalid kind", [
      { field: "kind", message: "거래 kind 값이 올바르지 않습니다." },
    ]);
  }
  return kind as TxnOverrideKind;
}

function normalizeCategory(value: unknown): TxnOverrideCategory | undefined {
  const category = asString(value).toLowerCase();
  if (!category) return undefined;
  if (!ALLOWED_CATEGORIES.has(category as TxnOverrideCategory)) {
    throw new TxnOverridesStoreInputError("invalid category", [
      { field: "category", message: "거래 category 값이 올바르지 않습니다." },
    ]);
  }
  return category as TxnOverrideCategory;
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

function sortedObject<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, T>;
}

function parseIso(value: unknown): string {
  const raw = asString(value);
  const timestamp = Date.parse(raw);
  if (!raw || !Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString();
}

function normalizeOverride(value: unknown): TxnOverride | null {
  if (!isRecord(value)) return null;
  try {
    const txnId = normalizeTxnId(value.txnId);
    const updatedAt = parseIso(value.updatedAt);
    if (!updatedAt) return null;

    const kind = normalizeKind(value.kind);
    const category = normalizeCategory(value.category);
    if (!kind && !category) return null;

    return {
      txnId,
      ...(kind ? { kind } : {}),
      ...(category ? { category } : {}),
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function readState(): Promise<TxnOverridesStoreState> {
  try {
    const raw = await fs.readFile(resolveOverridesPath(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.items)) {
      return { version: 1, items: {} };
    }

    const normalized: Record<string, TxnOverride> = {};
    for (const [txnId, row] of Object.entries(parsed.items)) {
      const candidate = normalizeOverride(isRecord(row) ? { ...row, txnId } : null);
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

async function writeState(state: TxnOverridesStoreState): Promise<void> {
  const items = sortedObject(state.items);
  await atomicWriteJson(resolveOverridesPath(), {
    version: 1,
    items,
  });
}

export async function listOverrides(): Promise<Record<string, TxnOverride>> {
  assertServerOnly();
  const state = await readState();
  return sortedObject(state.items);
}

export async function upsertOverride(
  txnId: unknown,
  patch: { kind?: unknown; category?: unknown },
): Promise<TxnOverride> {
  assertServerOnly();
  const safeTxnId = normalizeTxnId(txnId);
  const kind = normalizeKind(patch.kind);
  const category = normalizeCategory(patch.category);
  if (!kind && !category) {
    throw new TxnOverridesStoreInputError("empty override patch", [
      { field: "override", message: "kind 또는 category 중 하나 이상 필요합니다." },
    ]);
  }

  const state = await readState();
  const current = state.items[safeTxnId];
  const next: TxnOverride = {
    txnId: safeTxnId,
    ...(kind ? { kind } : (current?.kind ? { kind: current.kind } : {})),
    ...(category ? { category } : (current?.category ? { category: current.category } : {})),
    updatedAt: new Date().toISOString(),
  };
  state.items[safeTxnId] = next;
  await writeState(state);
  return next;
}

export async function deleteOverride(txnId: unknown): Promise<void> {
  assertServerOnly();
  const safeTxnId = normalizeTxnId(txnId);
  const state = await readState();
  if (!(safeTxnId in state.items)) return;
  delete state.items[safeTxnId];
  await writeState(state);
}
