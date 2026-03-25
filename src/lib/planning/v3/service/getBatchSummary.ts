import { sanitizeRecordId } from "../../store/paths";
import { roundKrw } from "../../calc";
import { type BatchSummary } from "../domain/batchSummaryTypes";
import { type CategoryId } from "../domain/types";
import { type StoredTransaction } from "../domain/transactions";
import { applyAccountMappingOverrides } from "./applyAccountMappingOverrides";
import { categorizeTransactions } from "./categorizeTransactions";
import { computeCashflowBreakdown } from "./computeCashflowBreakdown";
import { detectTransfers } from "./detectTransfers";
import { getAccountMappingOverrides } from "../store/accountMappingOverridesStore";
import { listRules } from "../store/categoryRulesStore";
import { getTransferOverrides } from "../store/txnTransferOverridesStore";
import {
  getBatchTxnOverrides,
  getStoredFirstBatchSummaryProjectionRows,
  loadStoredFirstBatchTransactions,
  toStoredFirstPublicMeta,
  type StoredFirstBatchReadResult,
} from "../transactions/store";

const TOP_EXPENSE_CATEGORY_LIMIT = 5;

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

function normalizeTxnId(value: unknown, index: number): string {
  const raw = asString(value).toLowerCase();
  if (raw) return raw;
  return `txn_${String(index).padStart(8, "0")}`;
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

function sortCategoryTotals(input: Map<CategoryId, number>): Array<{ categoryId: CategoryId; totalKrw: number }> {
  return [...input.entries()]
    .map(([categoryId, totalKrw]) => ({ categoryId, totalKrw: asNumber(totalKrw) }))
    .filter((row) => row.totalKrw > 0)
    .sort((left, right) => {
      if (left.totalKrw !== right.totalKrw) return right.totalKrw - left.totalKrw;
      return left.categoryId.localeCompare(right.categoryId);
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
  classificationReason?: StoredTransaction["classificationReason"];
  matchedRuleId?: StoredTransaction["matchedRuleId"];
}>): StoredTransaction[] {
  return [...rows]
    .map((row, index) => ({
      ...row,
      txnId: normalizeTxnId(row.txnId, index),
      batchId,
    }))
    .sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
      return left.txnId.localeCompare(right.txnId);
    });
}

async function loadBatchTransactions(batchId: string): Promise<StoredFirstBatchReadResult> {
  const loaded = await loadStoredFirstBatchTransactions(batchId);
  if (!loaded) {
    throw new GetBatchSummaryError("NOT_FOUND", "batch not found");
  }
  return loaded;
}

export async function getBatchSummary(batchIdInput: string): Promise<BatchSummary> {
  const batchId = normalizeBatchId(batchIdInput);
  const loaded = await loadBatchTransactions(batchId);
  // Summary follows the same public metadata boundary as list/detail surfaces.
  const publicMeta = toStoredFirstPublicMeta(loaded);
  const [rules, overridesByTxnId, accountOverrides, transferOverrides] = await Promise.all([
    listRules(),
    getBatchTxnOverrides(batchId).catch(() => ({})),
    getAccountMappingOverrides(batchId).catch(() => ({})),
    getTransferOverrides(batchId).catch(() => ({})),
  ]);
  // Summary shares the same reader-visible stored-first binding boundary as detail/cashflow.
  const projectedTransactions = getStoredFirstBatchSummaryProjectionRows(loaded);
  const mapped = applyAccountMappingOverrides(projectedTransactions, accountOverrides);
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
    ...(asString(publicMeta.createdAt) ? { createdAt: asString(publicMeta.createdAt) } : {}),
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
