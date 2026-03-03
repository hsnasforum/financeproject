import { describe, expect, it } from "vitest";
import { computeCashflowBreakdown } from "../src/lib/planning/v3/service/computeCashflowBreakdown";
import { type CategorizedTransactionRow } from "../src/lib/planning/v3/domain/types";

function tx(patch: Partial<CategorizedTransactionRow>): CategorizedTransactionRow {
  return {
    batchId: "batch-1",
    txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    date: "2026-03-01",
    amountKrw: -1000,
    source: "csv",
    categoryId: "unknown",
    category: "unknown",
    categorySource: "default",
    ...patch,
  };
}

describe("planning v3 computeCashflowBreakdown", () => {
  it("aggregates by month/category deterministically in ym asc order", () => {
    const rows = computeCashflowBreakdown([
      tx({
        txnId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        date: "2026-04-01",
        amountKrw: -12000,
        categoryId: "food",
      }),
      tx({
        txnId: "cccccccccccccccccccccccc",
        date: "2026-03-02",
        amountKrw: 2500000,
        categoryId: "income",
      }),
      tx({
        txnId: "dddddddddddddddddddddddd",
        date: "2026-03-03",
        amountKrw: -900000,
        categoryId: "housing",
      }),
      tx({
        txnId: "eeeeeeeeeeeeeeeeeeeeeeee",
        date: "2026-03-04",
        amountKrw: -45000,
        categoryId: "transfer",
      }),
    ]);

    expect(rows).toEqual([
      {
        ym: "2026-03",
        incomeKrw: 2500000,
        expenseKrw: 900000,
        transferKrw: 45000,
        byCategory: {
          income: 2500000,
          transfer: 45000,
          fixed: 0,
          variable: 0,
          debt: 0,
          tax: 0,
          insurance: 0,
          housing: 900000,
          food: 0,
          transport: 0,
          shopping: 0,
          health: 0,
          education: 0,
          etc: 0,
          unknown: 0,
        },
      },
      {
        ym: "2026-04",
        incomeKrw: 0,
        expenseKrw: 12000,
        transferKrw: 0,
        byCategory: {
          income: 0,
          transfer: 0,
          fixed: 0,
          variable: 0,
          debt: 0,
          tax: 0,
          insurance: 0,
          housing: 0,
          food: 12000,
          transport: 0,
          shopping: 0,
          health: 0,
          education: 0,
          etc: 0,
          unknown: 0,
        },
      },
    ]);
  });
});
