import {
  applyAccountMappingOverrides,
  computeMonthlyBalances,
  detectTransfers,
  getOpeningBalances,
  listAccounts,
} from "@/lib/planning/v3/balances/monthly";
import { loadBatchVisiblePipeline } from "@/lib/planning/v3/service/loadBatchVisiblePipeline";

export type MonthlyBalanceProjectionRow = {
  ym: string;
  accountId: string;
  openingKrw: number;
  netChangeKrw: number;
  closingKrw: number;
  transferKrw?: number;
};

export type MonthlyBalanceProjection = {
  batchId: string;
  data: MonthlyBalanceProjectionRow[];
  warnings: string[];
  items: MonthlyBalanceProjectionRow[];
};

export class MonthlyBalanceProjectionError extends Error {
  readonly code: "NO_DATA";

  constructor(message: string, code: "NO_DATA") {
    super(message);
    this.name = "MonthlyBalanceProjectionError";
    this.code = code;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function getMonthlyBalanceProjection(input: {
  batchId: string;
  includeTransfers?: boolean;
}): Promise<MonthlyBalanceProjection> {
  const batchId = asString(input.batchId);
  const [
    pipeline,
    openingBalances,
    accounts,
  ] = await Promise.all([
    loadBatchVisiblePipeline(batchId, { includeRules: false }),
    getOpeningBalances(),
    listAccounts(),
  ]);

  // Balances shares the batch-visible transaction/override boundary, while
  // opening balance and account fallback remain balances-surface inputs.
  const transactions = pipeline?.transactions ?? [];
  if (transactions.length < 1) {
    throw new MonthlyBalanceProjectionError("배치 거래를 찾을 수 없습니다.", "NO_DATA");
  }

  const openingByAccount = { ...openingBalances };
  for (const account of accounts) {
    if (openingByAccount[account.id]) continue;
    if (Number.isInteger(account.startingBalanceKrw)) {
      openingByAccount[account.id] = {
        accountId: account.id,
        asOfDate: "1970-01-01",
        amountKrw: Number(account.startingBalanceKrw),
      };
    }
  }

  const mapped = applyAccountMappingOverrides(transactions, pipeline?.accountOverrides ?? {});
  const transferDetected = detectTransfers({
    batchId,
    transactions: mapped,
    overridesByTxnId: pipeline?.transferOverrides ?? {},
  });

  const computed = computeMonthlyBalances({
    transactions: transferDetected.transactions.map((row) => ({
      ...row,
      txnId: asString(row.txnId).toLowerCase(),
      batchId,
    })),
    openingBalancesByAccount: openingByAccount,
    includeTransfers: input.includeTransfers === true,
    overridesByTxnId: pipeline?.overridesByTxnId ?? {},
  });

  return {
    batchId,
    data: computed.data,
    warnings: computed.warnings,
    items: computed.data,
  };
}
