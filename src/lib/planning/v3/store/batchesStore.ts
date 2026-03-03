import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile, atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { type ImportBatchMeta, type StoredTransaction } from "../domain/transactions";

type BatchesIndexState = {
  version: 1;
  items: ImportBatchMeta[];
};

const SAFE_YM_PATTERN = /^\d{4}-\d{2}$/;
const SAFE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_TXN_ID_PATTERN = /^[a-f0-9]{12,64}$/;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 batches store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseIso(value: unknown): string {
  const raw = asString(value);
  const ts = Date.parse(raw);
  if (!raw || !Number.isFinite(ts)) {
    throw new Error("invalid createdAt");
  }
  return new Date(ts).toISOString();
}

function parseNonNegativeInt(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("invalid number");
  }
  return parsed;
}

function sanitizeOptionalName(value: unknown): string | undefined {
  const normalized = asString(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 80);
}

function normalizeYm(value: unknown): string | undefined {
  const ym = asString(value);
  if (!ym || !SAFE_YM_PATTERN.test(ym)) return undefined;
  return ym;
}

function resolveBatchesRootDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_BATCHES_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "planning-v3", "batches");
}

function resolveIndexPath(cwd = process.cwd()): string {
  return path.join(resolveBatchesRootDir(cwd), "index.json");
}

function resolveBatchTransactionsPath(batchId: string, cwd = process.cwd()): string {
  return path.join(resolveBatchesRootDir(cwd), `${sanitizeRecordId(batchId)}.ndjson`);
}

function normalizeBatchMeta(value: unknown): ImportBatchMeta | null {
  if (!isRecord(value)) return null;

  try {
    const id = sanitizeRecordId(value.id);
    const createdAt = parseIso(value.createdAt);
    const source = value.source === "csv" ? "csv" : null;
    const rowCount = parseNonNegativeInt(value.rowCount);
    if (!source) return null;

    const accounts = Array.isArray(value.accounts)
      ? value.accounts
        .map((entry) => {
          if (!isRecord(entry)) return null;
          try {
            const accountId = sanitizeRecordId(entry.id);
            const name = sanitizeOptionalName(entry.name);
            return {
              id: accountId,
              ...(name ? { name } : {}),
            };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [];

    return {
      id,
      createdAt,
      source,
      rowCount,
      ...(normalizeYm(value.ymMin) ? { ymMin: normalizeYm(value.ymMin) } : {}),
      ...(normalizeYm(value.ymMax) ? { ymMax: normalizeYm(value.ymMax) } : {}),
      ...(accounts.length > 0 ? { accounts } : {}),
    };
  } catch {
    return null;
  }
}

function toSafeTransfer(value: unknown): StoredTransaction["transfer"] | undefined {
  if (!isRecord(value)) return undefined;
  const direction = asString(value.direction);
  if (direction !== "in" && direction !== "out") return undefined;
  const confidence = asString(value.confidence);
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") return undefined;
  const counterparty = asString(value.counterpartyAccountId);
  const matched = asString(value.matchedTxnId);
  return {
    direction,
    confidence,
    ...(counterparty ? { counterpartyAccountId: counterparty } : {}),
    ...(matched ? { matchedTxnId: matched } : {}),
  };
}

function normalizeStoredTransaction(value: unknown, batchId: string): StoredTransaction | null {
  if (!isRecord(value)) return null;

  try {
    const txnIdRaw = asString(value.txnId).toLowerCase();
    if (!SAFE_TXN_ID_PATTERN.test(txnIdRaw)) return null;

    const date = asString(value.date);
    if (!SAFE_DATE_PATTERN.test(date)) return null;

    const amountKrw = Math.round(Number(value.amountKrw));
    if (!Number.isFinite(amountKrw)) return null;

    const accountId = asString(value.accountId);
    const description = asString(value.description);
    const kind = asString(value.kind);
    const category = asString(value.category);
    const source = value.source === "csv" ? "csv" : "csv";
    const matchedRuleId = asString(value.matchedRuleId);
    const classificationReason = sanitizeOptionalName(value.classificationReason);
    const rowIndex = Math.trunc(Number((value.meta as Record<string, unknown> | undefined)?.rowIndex));

    const normalized: StoredTransaction = {
      txnId: txnIdRaw,
      batchId,
      ...(accountId ? { accountId: sanitizeRecordId(accountId) } : {}),
      date,
      amountKrw,
      ...(description ? { description } : {}),
      ...(kind === "income" || kind === "expense" || kind === "transfer" ? { kind } : {}),
      ...(toSafeTransfer(value.transfer) ? { transfer: toSafeTransfer(value.transfer) } : {}),
      ...(category === "fixed" || category === "variable" || category === "saving" || category === "invest" || category === "unknown"
        ? { category }
        : {}),
      ...(classificationReason ? { classificationReason } : {}),
      ...(matchedRuleId ? { matchedRuleId } : {}),
      source,
      ...(Number.isFinite(rowIndex) && rowIndex > 0 ? { meta: { rowIndex } } : {}),
    };
    return normalized;
  } catch {
    return null;
  }
}

function sortMetaById(items: ImportBatchMeta[]): ImportBatchMeta[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function sortTransactionsDeterministic(items: StoredTransaction[]): StoredTransaction[] {
  return [...items].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
    return left.txnId.localeCompare(right.txnId);
  });
}

async function readIndexState(): Promise<BatchesIndexState> {
  try {
    const parsed = JSON.parse(await fs.readFile(resolveIndexPath(), "utf-8")) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return { version: 1, items: [] };
    }
    const items = parsed.items
      .map((item) => normalizeBatchMeta(item))
      .filter((item): item is ImportBatchMeta => item !== null);
    return {
      version: 1,
      items: sortMetaById(items),
    };
  } catch {
    return { version: 1, items: [] };
  }
}

async function writeIndexState(state: BatchesIndexState): Promise<void> {
  await atomicWriteJson(resolveIndexPath(), {
    version: 1,
    items: sortMetaById(state.items),
  });
}

export async function listBatches(): Promise<ImportBatchMeta[]> {
  assertServerOnly();
  const state = await readIndexState();
  return sortMetaById(state.items);
}

export async function getBatchMeta(batchId: string): Promise<ImportBatchMeta | null> {
  assertServerOnly();
  const safeBatchId = sanitizeRecordId(batchId);
  const state = await readIndexState();
  return state.items.find((item) => item.id === safeBatchId) ?? null;
}

export async function saveBatch(meta: ImportBatchMeta, transactions: StoredTransaction[]): Promise<void> {
  assertServerOnly();

  const normalizedMeta = normalizeBatchMeta(meta);
  if (!normalizedMeta) {
    throw new Error("invalid batch meta");
  }

  const normalizedTransactions = sortTransactionsDeterministic(
    transactions
      .map((row) => normalizeStoredTransaction(row, normalizedMeta.id))
      .filter((row): row is StoredTransaction => row !== null),
  );

  const lines = normalizedTransactions.map((row) => JSON.stringify({
    ...row,
    batchId: normalizedMeta.id,
  }));
  await atomicWriteFile(
    resolveBatchTransactionsPath(normalizedMeta.id),
    lines.length > 0 ? `${lines.join("\n")}\n` : "",
  );

  const state = await readIndexState();
  const byId = new Map(state.items.map((item) => [item.id, item]));
  byId.set(normalizedMeta.id, normalizedMeta);
  await writeIndexState({
    version: 1,
    items: sortMetaById([...byId.values()]),
  });
}

export async function getBatchTransactions(batchId: string): Promise<StoredTransaction[]> {
  assertServerOnly();
  const safeBatchId = sanitizeRecordId(batchId);
  try {
    const raw = await fs.readFile(resolveBatchTransactionsPath(safeBatchId), "utf-8");
    if (!raw.trim()) return [];

    const rows = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return null;
        }
      })
      .filter((row): row is unknown => row !== null)
      .map((row) => normalizeStoredTransaction(row, safeBatchId))
      .filter((row): row is StoredTransaction => row !== null);

    return sortTransactionsDeterministic(rows);
  } catch {
    return [];
  }
}

export async function deleteBatch(batchId: string): Promise<void> {
  assertServerOnly();
  const safeBatchId = sanitizeRecordId(batchId);

  const state = await readIndexState();
  const nextItems = state.items.filter((item) => item.id !== safeBatchId);
  if (nextItems.length !== state.items.length) {
    await writeIndexState({ version: 1, items: nextItems });
  }

  await fs.unlink(resolveBatchTransactionsPath(safeBatchId)).catch(() => undefined);
}
