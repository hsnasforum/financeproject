import { describe, expect, it } from "vitest";
import { applyTxnOverrides } from "../src/lib/planning/v3/service/applyOverrides";
import { type AccountTransaction, type TxnOverride } from "../src/lib/planning/v3/domain/types";

describe("planning v3 applyTxnOverrides", () => {
  it("overrides kind/category by txnId", () => {
    const transactions: AccountTransaction[] = [
      {
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        date: "2026-03-01",
        amountKrw: 1000,
        description: "masked salary",
        source: "csv",
        kind: "income",
        category: "unknown",
      },
      {
        txnId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        date: "2026-03-02",
        amountKrw: -100,
        description: "masked card",
        source: "csv",
        kind: "expense",
        category: "variable",
      },
    ];
    const overrides: Record<string, TxnOverride> = {
      aaaaaaaaaaaaaaaaaaaaaaaa: {
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        kind: "transfer",
        category: "saving",
        updatedAt: "2026-03-03T00:00:00.000Z",
      },
    };

    const applied = applyTxnOverrides(transactions, overrides);
    expect(applied[0]?.kind).toBe("transfer");
    expect(applied[0]?.category).toBe("saving");
    expect(applied[1]?.kind).toBe("expense");
    expect(applied[1]?.category).toBe("variable");
  });

  it("ignores overrides safely when txnId is missing or not found", () => {
    const transactions: AccountTransaction[] = [
      {
        date: "2026-03-01",
        amountKrw: 500,
        source: "csv",
        kind: "income",
        category: "unknown",
      },
      {
        txnId: "cccccccccccccccccccccccc",
        date: "2026-03-02",
        amountKrw: -50,
        source: "csv",
        kind: "expense",
        category: "unknown",
      },
    ];
    const overrides: Record<string, TxnOverride> = {
      dddddddddddddddddddddddd: {
        txnId: "dddddddddddddddddddddddd",
        kind: "income",
        updatedAt: "2026-03-03T00:00:00.000Z",
      },
    };

    const applied = applyTxnOverrides(transactions, overrides);
    expect(applied).toEqual(transactions);
  });
});
