import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { type AccountMappingOverride } from "../domain/types";
import { isTxnId } from "../service/txnId";

type AccountMappingOverridesState = {
  version: 1;
  items: Record<string, AccountMappingOverride>;
};

export class AccountMappingOverridesStoreInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "AccountMappingOverridesStoreInputError";
    this.details = details;
  }
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 account mapping overrides store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveOverridesDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_TXN_ACCOUNT_OVERRIDES_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "planning-v3", "txn-account-overrides");
}

function resolveOverridesPath(batchId: string, cwd = process.cwd()): string {
  return path.join(resolveOverridesDir(cwd), `${sanitizeRecordId(batchId)}.json`);
}

function normalizeBatchId(value: unknown): string {
  const raw = asString(value);
  if (!raw) {
    throw new AccountMappingOverridesStoreInputError("invalid batchId", [
      { field: "batchId", message: "batchId가 필요합니다." },
    ]);
  }
  try {
    return sanitizeRecordId(raw);
  } catch {
    throw new AccountMappingOverridesStoreInputError("invalid batchId", [
      { field: "batchId", message: "batchId 형식이 올바르지 않습니다." },
    ]);
  }
}

function normalizeTxnId(value: unknown): string {
  const raw = asString(value).toLowerCase();
  if (!isTxnId(raw)) {
    throw new AccountMappingOverridesStoreInputError("invalid txnId", [
      { field: "txnId", message: "txnId 형식이 올바르지 않습니다." },
    ]);
  }
  return raw;
}

function normalizeAccountId(value: unknown): string {
  const raw = asString(value);
  if (!raw) {
    throw new AccountMappingOverridesStoreInputError("invalid accountId", [
      { field: "accountId", message: "accountId가 필요합니다." },
    ]);
  }
  if (raw === "unassigned") return raw;
  try {
    return sanitizeRecordId(raw);
  } catch {
    throw new AccountMappingOverridesStoreInputError("invalid accountId", [
      { field: "accountId", message: "accountId 형식이 올바르지 않습니다." },
    ]);
  }
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

function normalizeRow(value: unknown, batchId: string): AccountMappingOverride | null {
  if (!isRecord(value)) return null;
  try {
    const txnId = normalizeTxnId(value.txnId);
    const accountId = normalizeAccountId(value.accountId);
    const updatedAt = parseIso(value.updatedAt);
    if (!updatedAt) return null;
    return {
      batchId,
      txnId,
      accountId,
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function readState(batchId: string): Promise<AccountMappingOverridesState> {
  const safeBatchId = normalizeBatchId(batchId);
  try {
    const parsed = JSON.parse(await fs.readFile(resolveOverridesPath(safeBatchId), "utf-8")) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.items)) {
      return { version: 1, items: {} };
    }
    const normalized: Record<string, AccountMappingOverride> = {};
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

async function writeState(batchId: string, state: AccountMappingOverridesState): Promise<void> {
  const safeBatchId = normalizeBatchId(batchId);
  await atomicWriteJson(resolveOverridesPath(safeBatchId), {
    version: 1,
    items: sortedObject(state.items),
  });
}

export async function getAccountMappingOverrides(batchId: unknown): Promise<Record<string, AccountMappingOverride>> {
  assertServerOnly();
  const safeBatchId = normalizeBatchId(batchId);
  const state = await readState(safeBatchId);
  return sortedObject(state.items);
}

export async function upsertAccountMappingOverride(input: {
  batchId: unknown;
  txnId: unknown;
  accountId: unknown;
}): Promise<AccountMappingOverride> {
  assertServerOnly();

  const batchId = normalizeBatchId(input.batchId);
  const txnId = normalizeTxnId(input.txnId);
  const accountId = normalizeAccountId(input.accountId);

  const state = await readState(batchId);
  const next: AccountMappingOverride = {
    batchId,
    txnId,
    accountId,
    updatedAt: new Date().toISOString(),
  };
  state.items[txnId] = next;
  await writeState(batchId, state);
  return next;
}
