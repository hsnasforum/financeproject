import { type StoredTransaction } from "../domain/transactions";
import {
  type CategoryId,
  type CategoryRule,
  type ProfileV2DraftPatch,
  type TxnOverride,
  type TxnTransferOverride,
} from "../domain/types";
import { type DraftProfileEvidence } from "../domain/draftTypes";
import { DRAFT_PROFILE_POLICY, type DraftProfilePolicy } from "../policy/draftProfilePolicy";
import { EXPENSE_FLOW_CATEGORY_POLICY } from "../policy/expenseFlowCategoryPolicy";
import { roundKrw } from "../../calc";
import { applyAccountMappingOverrides } from "./applyAccountMappingOverrides";
import { categorizeTransactions } from "./categorizeTransactions";
import { computeCashflowBreakdown } from "./computeCashflowBreakdown";
import { detectTransfers } from "./detectTransfers";
import { getAccountMappingOverrides } from "../store/accountMappingOverridesStore";
import { listRules } from "../store/categoryRulesStore";
import { getTransferOverrides } from "../store/txnTransferOverridesStore";
import {
  applyStoredFirstBatchAccountBinding,
  getBatchTxnOverrides,
  loadStoredFirstBatchTransactions,
} from "../transactions/store";

type YmStat = {
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  fixedExpenseKrw: number;
  variableExpenseKrw: number;
  debtExpenseKrw: number;
  transferKrw: number;
};

export type GenerateDraftPatchFromBatchResult = {
  draftPatch: ProfileV2DraftPatch;
  evidence: DraftProfileEvidence;
  assumptions: string[];
  stats: {
    months: number;
    transfersExcluded: true;
    unassignedCount: number;
  };
};

type GenerateDraftPatchFromBatchInput = {
  batchId: string;
  policy?: DraftProfilePolicy;
};

type LoadedPipeline = {
  transactions: StoredTransaction[];
  rules: CategoryRule[];
  overridesByTxnId: Record<string, TxnOverride>;
  transferOverrides: Record<string, TxnTransferOverride>;
  accountOverrides: Record<string, { batchId: string; txnId: string; accountId: string; updatedAt: string }>;
};

export class GenerateDraftPatchFromBatchError extends Error {
  readonly code: "INPUT" | "NOT_FOUND" | "NO_DATA";

  constructor(code: "INPUT" | "NOT_FOUND" | "NO_DATA", message: string) {
    super(message);
    this.name = "GenerateDraftPatchFromBatchError";
    this.code = code;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRoundedInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return roundKrw(parsed);
}

function medianRounded(values: number[]): number {
  if (values.length < 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.trunc(sorted.length / 2);
  if (sorted.length % 2 === 1) return roundKrw(sorted[middle] ?? 0);
  return roundKrw(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function toStoredTransactions(batchId: string, rows: Array<{
  txnId?: string;
  accountId?: string;
  date: string;
  amountKrw: number;
  description?: string;
  kind?: "income" | "expense" | "transfer";
  category?: string;
  categoryId?: string;
  source: "csv";
  transfer?: {
    direction: "out" | "in";
    counterpartyAccountId?: string;
    matchedTxnId?: string;
    confidence: "high" | "medium" | "low";
  };
  meta?: { rowIndex: number };
  classificationReason?: string;
  matchedRuleId?: string;
}>): StoredTransaction[] {
  return [...rows]
    .map((row) => {
      const txnId = asString(row.txnId).toLowerCase();
      if (!txnId) return null;
      return {
        ...row,
        txnId,
        batchId,
      };
    })
    .filter((row): row is StoredTransaction => row !== null)
    .sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
      return left.txnId.localeCompare(right.txnId);
    });
}

async function loadPipeline(batchId: string): Promise<LoadedPipeline> {
  const loaded = await loadStoredFirstBatchTransactions(batchId);
  if (!loaded) {
    throw new GenerateDraftPatchFromBatchError("NOT_FOUND", "batch not found");
  }

  const [rules, overridesByTxnId, accountOverrides, transferOverrides] = await Promise.all([
    listRules(),
    getBatchTxnOverrides(batchId).catch(() => ({})),
    getAccountMappingOverrides(batchId).catch(() => ({})),
    getTransferOverrides(batchId).catch(() => ({})),
  ]);

  return {
    // Draft patch generation shares the same stored-first visible binding view as
    // balances/detail/cashflow, while the command-side coexistence writer stays guarded.
    transactions: applyStoredFirstBatchAccountBinding(loaded),
    rules,
    overridesByTxnId,
    transferOverrides,
    accountOverrides,
  };
}

function buildRuleCoverage(sources: Array<"override" | "rule" | "default" | "transfer">): DraftProfileEvidence["ruleCoverage"] {
  const coverage: DraftProfileEvidence["ruleCoverage"] = {
    total: 0,
    override: 0,
    rule: 0,
    default: 0,
    transfer: 0,
  };
  for (const source of sources) {
    coverage.total += 1;
    coverage[source] += 1;
  }
  return coverage;
}

function buildCategoryStats(ymStats: YmStat[], categories: CategoryId[]): Array<{ categoryId: CategoryId; totalKrw: number }> {
  const totals = new Map<CategoryId, number>();
  for (const categoryId of categories) {
    totals.set(categoryId, 0);
  }
  for (const row of ymStats) {
    totals.set("income", (totals.get("income") ?? 0) + row.incomeKrw);
    totals.set("transfer", (totals.get("transfer") ?? 0) + row.transferKrw);
    totals.set("debt", (totals.get("debt") ?? 0) + row.debtExpenseKrw);
    totals.set("fixed", (totals.get("fixed") ?? 0) + row.fixedExpenseKrw);
    totals.set("variable", (totals.get("variable") ?? 0) + row.variableExpenseKrw);
  }

  return [...totals.entries()]
    .map(([categoryId, totalKrw]) => ({ categoryId, totalKrw: roundKrw(totalKrw) }))
    .filter((row) => row.totalKrw > 0)
    .sort((left, right) => {
      if (left.totalKrw !== right.totalKrw) return right.totalKrw - left.totalKrw;
      return left.categoryId.localeCompare(right.categoryId);
    });
}

function buildAssumptions(monthCount: number, fixedCategoryIds: CategoryId[]): string[] {
  return [
    `income median is computed from recent ${monthCount} month(s), transfer excluded`,
    `fixed expense uses category ids: ${fixedCategoryIds.join(", ")}`,
    "variable expense = total expense - fixed expense",
    "debt expense is reported separately from category 'debt'",
  ];
}

const DEFAULT_CATEGORY_ORDER: CategoryId[] = [
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
];

export async function generateDraftPatchFromBatch(
  input: GenerateDraftPatchFromBatchInput,
): Promise<GenerateDraftPatchFromBatchResult> {
  const batchId = asString(input.batchId);
  if (!batchId) {
    throw new GenerateDraftPatchFromBatchError("INPUT", "batchId is required");
  }

  const policy = input.policy ?? DRAFT_PROFILE_POLICY;
  const expenseFlowPolicy = EXPENSE_FLOW_CATEGORY_POLICY;
  const loaded = await loadPipeline(batchId);

  const mapped = applyAccountMappingOverrides(loaded.transactions, loaded.accountOverrides);
  const transferDetected = detectTransfers({
    batchId,
    transactions: mapped,
    overridesByTxnId: loaded.transferOverrides,
  });
  const transferApplied = toStoredTransactions(batchId, transferDetected.transactions);

  const categorized = categorizeTransactions({
    transactions: transferApplied,
    rules: loaded.rules,
    overridesByTxnId: loaded.overridesByTxnId,
  });

  const breakdown = computeCashflowBreakdown(categorized)
    .sort((left, right) => left.ym.localeCompare(right.ym));
  if (breakdown.length < 1) {
    throw new GenerateDraftPatchFromBatchError("NO_DATA", "no monthly breakdown");
  }

  const recentMonths = Math.max(1, Math.trunc(policy.recentMonths || 0));
  const monthsSlice = breakdown.slice(Math.max(0, breakdown.length - recentMonths));
  const ymStats: YmStat[] = monthsSlice.map((row) => {
    const fixedExpenseKrw = expenseFlowPolicy.fixedExpenseCategoryIds
      .reduce((sum, categoryId) => sum + asRoundedInt(row.byCategory[categoryId]), 0);
    const expenseKrw = asRoundedInt(row.expenseKrw);
    const variableExpenseKrw = Math.max(0, expenseKrw - fixedExpenseKrw);
    return {
      ym: row.ym,
      incomeKrw: asRoundedInt(row.incomeKrw),
      expenseKrw,
      fixedExpenseKrw,
      variableExpenseKrw,
      debtExpenseKrw: asRoundedInt(row.byCategory.debt),
      transferKrw: asRoundedInt(row.transferKrw),
    };
  });

  const monthsUsed = ymStats.map((row) => row.ym);
  const incomeMedianKrw = medianRounded(ymStats.map((row) => row.incomeKrw));
  const expenseMedianKrw = medianRounded(ymStats.map((row) => row.expenseKrw));
  const fixedMedianKrw = medianRounded(ymStats.map((row) => row.fixedExpenseKrw));
  const variableMedianKrw = medianRounded(ymStats.map((row) => row.variableExpenseKrw));
  const debtMedianKrw = medianRounded(ymStats.map((row) => row.debtExpenseKrw));
  const assumptions = buildAssumptions(ymStats.length, [...expenseFlowPolicy.fixedExpenseCategoryIds]);

  return {
    draftPatch: {
      monthlyIncomeNet: incomeMedianKrw,
      monthlyEssentialExpenses: fixedMedianKrw,
      monthlyDiscretionaryExpenses: variableMedianKrw,
      assumptions,
      monthsConsidered: ymStats.length,
    },
    evidence: {
      monthsUsed,
      ymStats,
      byCategoryStats: buildCategoryStats(ymStats, DEFAULT_CATEGORY_ORDER),
      medians: {
        incomeKrw: incomeMedianKrw,
        expenseKrw: expenseMedianKrw,
        fixedExpenseKrw: fixedMedianKrw,
        variableExpenseKrw: variableMedianKrw,
        debtExpenseKrw: debtMedianKrw,
      },
      ruleCoverage: buildRuleCoverage(categorized.map((row) => row.categorySource)),
    },
    assumptions,
    stats: {
      months: ymStats.length,
      transfersExcluded: true,
      unassignedCount: transferDetected.unassignedCount,
    },
  };
}
