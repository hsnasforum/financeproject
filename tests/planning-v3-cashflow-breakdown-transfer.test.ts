import { describe, expect, it } from "vitest";
import { computeCashflowBreakdown } from "../src/lib/planning/v3/service/computeCashflowBreakdown";
import { type CategorizedTransactionRow } from "../src/lib/planning/v3/domain/types";

function row(patch: Partial<CategorizedTransactionRow>): CategorizedTransactionRow {
  return {
    batchId: "batch-1",
    txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    date: "2026-03-01",
    amountKrw: -1000,
    source: "csv",
    categoryId: "unknown",
    categorySource: "default",
    ...patch,
  };
}

describe("planning v3 cashflow breakdown transfer handling", () => {
  it("excludes transfer-tagged tx from expense/income and adds to transferKrw", () => {
    const breakdown = computeCashflowBreakdown([
      row({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", amountKrw: -100000, categoryId: "food" }),
      row({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", amountKrw: 200000, categoryId: "income" }),
      row({
        txnId: "cccccccccccccccccccccccc",
        amountKrw: -50000,
        kind: "transfer",
        categoryId: "unknown",
        transferGroupId: "g1",
      }),
    ]);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]?.incomeKrw).toBe(200000);
    expect(breakdown[0]?.expenseKrw).toBe(100000);
    expect(breakdown[0]?.transferKrw).toBe(50000);
    expect(breakdown[0]?.byCategory.transfer).toBe(50000);
  });
});
