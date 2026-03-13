import { sanitizeRecordId } from "../../store/paths";
import { roundKrw } from "../../calc";
import { type BatchSummary } from "../domain/batchSummaryTypes";
import { type CategoryId, type TxnOverride } from "../domain/types";
import { type StoredTransaction } from "../domain/transactions";
import { applyAccountMappingOverrides } from "./applyAccountMappingOverrides";
import { categorizeTransactions } from "./categorizeTransactions";
import { computeCashflowBreakdown } from "./computeCashflowBreakdown";
import { detectTransfers } from "./detectTransfers";
import { readBatchTransactions } from "./transactionStore";
import { getAccountMappingOverrides } from "../store/accountMappingOverridesStore";
import { getBatchMeta, getBatchTransactions } from "../store/batchesStore";
import { listRules } from "../store/categoryRulesStore";
import { getTransferOverrides } from "../store/txnTransferOverridesStore";
import { getOverrides, listOverrides } from "../store/txnOverridesStore";

const TOP_EXPENSE_CATEGORY_LIMIT = 5;

type LoadedBatchTransactions = {
  batchId: string;
  createdAt?: string;
  transactions: StoredTransaction[];
};

export class GetBatchSummaryError extends Error {
  readonly code: "INPUT" | "NOT_FOUND";

  constructor(code: "INPUT" | "NOT_FOUND", message: string) {
    super(message);
    this.name = "GetBatchSummaryError";
    this.code = code;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return roundKrw(parsed);
}

function normalizeBatchId(value: unknown): string {
  const text = asString(value);
  if (!text) {
    throw new GetBatchSummaryError("INPUT", "batchId is required");
  }
  try {
    return sanitizeRecordId(text);
  } catch {
    throw new GetBatchSummaryError("INPUT", "invalid batchId");
  }
}

function normalizeTxnId(value: unknown, index: number): string {
  const raw = asString(value).toLowerCase();
  if (raw) return raw;
  return `txn_${String(index).padStart(8, "0")}`;
}

function sortTransactions(rows: StoredTransaction[]): StoredTransaction[] {
  return [...rows].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
    return left.txnId.localeCompare(right.txnId);
  });
}

function toStoredTransactions(batchId: string, rows: Array<{
  txnId?: string;
  accountId?: StoredTransaction["accountId"];
  date: StoredTransaction["date"];
  amountKrw: StoredTransaction["amountKrw"];
  description?: StoredTransaction["description"];
  kind?: StoredTransaction["kind"];
  category?: StoredTransaction["category"];
  categoryId?: StoredTransaction["categoryId"];
  source: StoredTransaction["source"];
  transfer?: StoredTransaction["transfer"];
  meta?: StoredTransaction["meta"];
}>): StoredTransaction[] {
  return sortTransactions(
    rows
      .map((row, index) => ({
        ...row,
        txnId: normalizeTxnId(row.txnId, index),
        batchId,
      })),
  );
}

function mergeOverrides(
  scoped: Record<string, TxnOverride>,
  global: Record<string, TxnOverride>,
): Record<string, TxnOverride> {
  return {
    ...global,
    ...scoped,
  };
}

function sortCategoryTotals(input: Map<CategoryId, number>): Array<{ categoryId: CategoryId; totalKrw: number }> {
  return [...input.entries()]
    .map(([categoryId, totalKrw]) => ({ categoryId, totalKrw: asNumber(totalKrw) }))
    .filter((row) => row.totalKrw > 0)
    .sort((left, right) => {
      if (left.totalKrw !== right.totalKrw) return right.totalKrw - left.totalKrw;
      return left.categoryId.localeCompare(right.categoryId);
    });
}

async function loadBatchTransactions(batchId: string): Promise<LoadedBatchTransactions> {
  const [legacy, storedMeta, stored] = await Promise.all([
    readBatchTransactions(batchId),
    getBatchMeta(batchId).catch(() => null),
    getBatchTransactions(batchId).catch(() => []),
  ]);

  const legacyTx = legacy ? toStoredTransactions(legacy.batch.id, legacy.transactions) : [];
  const storedTx = sortTransactions(stored.map((row, index) => ({
    ...row,
    txnId: normalizeTxnId(row.txnId, index),
    batchId: batchId,
  })));

  if (legacyTx.length < 1 && storedTx.length < 1) {
    throw new GetBatchSummaryError("NOT_FOUND", "batch not found");
  }

  if (storedTx.length > legacyTx.length) {
    return {
      batchId,
      ...(storedMeta?.createdAt ? { createdAt: storedMeta.createdAt } : {}),
      transactions: storedTx,
    };
  }

  if (legacy) {
    return {
      batchId: legacy.batch.id,
      createdAt: legacy.batch.createdAt,
      transactions: legacyTx,
    };
  }

  return {
    batchId,
    ...(storedMeta?.createdAt ? { createdAt: storedMeta.createdAt } : {}),
    transactions: storedTx,
  };
}

export async function getBatchSummary(batchIdInput: string): Promise<BatchSummary> {
  const batchId = normalizeBatchId(batchIdInput);
  const loaded = await loadBatchTransactions(batchId);
  const [rules, scopedOverrides, globalOverrides, accountOverrides, transferOverrides] = await Promise.all([
    listRules(),
    getOverrides(batchId).catch(() => ({})),
    listOverrides().catch(() => ({})),
    getAccountMappingOverrides(batchId).catch(() => ({})),
    getTransferOverrides(batchId).catch(() => ({})),
  ]);

  const overridesByTxnId = mergeOverrides(scopedOverrides, globalOverrides);
  const mapped = applyAccountMappingOverrides(loaded.transactions, accountOverrides);
  const transferDetected = detectTransfers({
    batchId,
    transactions: mapped,
    overridesByTxnId: transferOverrides,
  });
  const transferApplied = toStoredTransactions(batchId, transferDetected.transactions);

  const categorized = categorizeTransactions({
    transactions: transferApplied,
    rules,
    overridesByTxnId,
  });
  const breakdown = computeCashflowBreakdown(categorized).sort((left, right) => left.ym.localeCompare(right.ym));

  const monthly = breakdown.map((row) => ({
    ym: row.ym,
    incomeKrw: asNumber(row.incomeKrw),
    expenseKrw: asNumber(row.expenseKrw),
    transferKrw: asNumber(row.transferKrw),
  }));

  const totals = monthly.reduce((acc, row) => ({
    incomeKrw: acc.incomeKrw + row.incomeKrw,
    expenseKrw: acc.expenseKrw + row.expenseKrw,
    transferKrw: acc.transferKrw + row.transferKrw,
  }), {
    incomeKrw: 0,
    expenseKrw: 0,
    transferKrw: 0,
  });

  const expenseByCategory = new Map<CategoryId, number>();
  for (const row of categorized) {
    const isTransfer = row.kind === "transfer" || row.transfer !== undefined || row.categoryId === "transfer";
    if (isTransfer) continue;
    if (asNumber(row.amountKrw) >= 0) continue;
    const categoryId: CategoryId = row.categoryId ?? "unknown";
    expenseByCategory.set(categoryId, (expenseByCategory.get(categoryId) ?? 0) + Math.abs(asNumber(row.amountKrw)));
  }

  const topExpenseCategories = sortCategoryTotals(expenseByCategory).slice(0, TOP_EXPENSE_CATEGORY_LIMIT);
  const unknownCategoryCount = categorized
    .filter((row) => (row.categoryId ?? "unknown") === "unknown")
    .length;
  const transferCount = categorized
    .filter((row) => row.kind === "transfer" || row.transfer !== undefined || row.categoryId === "transfer")
    .length;

  return {
    batchId: loaded.batchId,
    ...(loaded.createdAt ? { createdAt: loaded.createdAt } : {}),
    ...(monthly.length > 0
      ? {
          range: {
            fromYm: monthly[0]?.ym,
            toYm: monthly[monthly.length - 1]?.ym,
            months: monthly.length,
          },
        }
      : {}),
    counts: {
      txns: categorized.length,
      transfers: transferCount,
      unassignedCategory: unknownCategoryCount,
    },
    totals: {
      incomeKrw: asNumber(totals.incomeKrw),
      expenseKrw: asNumber(totals.expenseKrw),
      transferKrw: asNumber(totals.transferKrw),
    },
    topExpenseCategories,
    monthly,
  };
}
