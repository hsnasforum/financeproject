import path from "node:path";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { readJsonFile, storageSchemaCorrupted, toStorageWriteError } from "../../storage/serverFileRead";
import { withPlanningStoreWriteLock } from "../../storage/storeWriteLock";
import { isPlanningNamespaceEnabled } from "../../store/namespace";
import { sanitizeRecordId } from "../../store/paths";
import { type AccountMappingOverride } from "../domain/types";
import { isTxnId } from "../service/txnId";
import { resolvePlanningV3DataDir } from "./dataDir";

type AccountMappingOverridesState = {
  version: 1;
  items: Record<string, AccountMappingOverride>;
  hadInvalidItems?: boolean;
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
  if (isPlanningNamespaceEnabled()) return path.join(resolvePlanningV3DataDir(cwd), "txn-account-overrides");

  const override = asString(process.env.PLANNING_V3_TXN_ACCOUNT_OVERRIDES_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningV3DataDir(cwd), "txn-account-overrides");
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

function parseState(parsed: unknown, batchId: string, filePath: string): AccountMappingOverridesState {
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.items)) {
    throw storageSchemaCorrupted(filePath, "account mapping overrides storage schema is invalid");
  }

  const normalized: Record<string, AccountMappingOverride> = {};
  let hadInvalidItems = false;
  for (const [txnId, row] of Object.entries(parsed.items)) {
    const candidate = normalizeRow(isRecord(row) ? { ...row, txnId } : null, batchId);
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

async function readState(batchId: string, filePath = resolveOverridesPath(batchId)): Promise<AccountMappingOverridesState> {
  const safeBatchId = normalizeBatchId(batchId);
  const loaded = await readJsonFile(filePath);
  if (loaded.kind === "not-found") return { version: 1, items: {} };
  return parseState(loaded.value, safeBatchId, filePath);
}

async function writeState(filePath: string, state: AccountMappingOverridesState): Promise<void> {
  try {
    await atomicWriteJson(filePath, {
      version: 1,
      items: sortedObject(state.items),
    });
  } catch (error) {
    throw toStorageWriteError(error, filePath);
  }
}

function withAccountMappingWriteLock<T>(filePath: string, callback: () => Promise<T> | T): Promise<T> {
  return withPlanningStoreWriteLock(`planning-v3:account-mapping-overrides:${filePath}`, callback);
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

  const filePath = resolveOverridesPath(batchId);
  return withAccountMappingWriteLock(filePath, async () => {
    const state = await readState(batchId, filePath);
    if (state.hadInvalidItems) {
      throw storageSchemaCorrupted(filePath, "account mapping overrides storage contains invalid items");
    }
    const next: AccountMappingOverride = {
      batchId,
      txnId,
      accountId,
      updatedAt: new Date().toISOString(),
    };
    state.items[txnId] = next;
    await writeState(filePath, state);
    return next;
  });
}
