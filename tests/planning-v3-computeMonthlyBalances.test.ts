import { describe, expect, it } from "vitest";
import { computeMonthlyBalances } from "../src/lib/planning/v3/service/computeMonthlyBalances";
import { type OpeningBalance } from "../src/lib/planning/v3/domain/types";
import { type StoredTransaction } from "../src/lib/planning/v3/domain/transactions";

function tx(input: {
  batchId?: string;
  txnId: string;
  accountId?: string;
  date: string;
  amountKrw: number;
  description?: string;
}): StoredTransaction {
  return {
    txnId: input.txnId,
    batchId: input.batchId ?? "batch-a",
    ...(input.accountId ? { accountId: input.accountId } : {}),
    date: input.date,
    amountKrw: input.amountKrw,
    ...(input.description ? { description: input.description } : {}),
    source: "csv",
  };
}

function opening(accountId: string, amountKrw: number, asOfDate = "2026-01-01"): OpeningBalance {
  return { accountId, asOfDate, amountKrw };
}

describe("planning v3 computeMonthlyBalances", () => {
  it("computes 3-month closing timeline for single account", () => {
    const result = computeMonthlyBalances({
      transactions: [
        tx({ txnId: "a1", accountId: "acc-main", date: "2026-01-03", amountKrw: 100 }),
        tx({ txnId: "a2", accountId: "acc-main", date: "2026-02-01", amountKrw: -20 }),
        tx({ txnId: "a3", accountId: "acc-main", date: "2026-03-01", amountKrw: 50 }),
      ],
      openingBalancesByAccount: {
        "acc-main": opening("acc-main", 1000),
      },
    });

    expect(result.data).toEqual([
      { ym: "2026-01", accountId: "acc-main", openingKrw: 1000, netChangeKrw: 100, closingKrw: 1100 },
      { ym: "2026-02", accountId: "acc-main", openingKrw: 1100, netChangeKrw: -20, closingKrw: 1080 },
      { ym: "2026-03", accountId: "acc-main", openingKrw: 1080, netChangeKrw: 50, closingKrw: 1130 },
    ]);
  });

  it("exclude-transfers option changes net deterministically", () => {
    const transactions = [
      tx({ txnId: "t1", accountId: "acc-a", date: "2026-03-01", amountKrw: -200, description: "transfer" }),
      tx({ txnId: "t2", accountId: "acc-b", date: "2026-03-01", amountKrw: 200, description: "transfer" }),
      tx({ txnId: "t3", accountId: "acc-a", date: "2026-03-02", amountKrw: -50, description: "lunch" }),
    ];
    const openingBalancesByAccount = {
      "acc-a": opening("acc-a", 1000),
      "acc-b": opening("acc-b", 500),
    };

    const included = computeMonthlyBalances({
      transactions,
      openingBalancesByAccount,
      includeTransfers: true,
    });
    const excluded = computeMonthlyBalances({
      transactions,
      openingBalancesByAccount,
      includeTransfers: false,
    });

    expect(included.data.find((row) => row.accountId === "acc-a")?.closingKrw).toBe(750);
    expect(excluded.data.find((row) => row.accountId === "acc-a")?.closingKrw).toBe(950);
  });

  it("creates warning for unassigned account transactions", () => {
    const result = computeMonthlyBalances({
      transactions: [
        tx({ txnId: "u1", date: "2026-03-01", amountKrw: 1000 }),
      ],
      openingBalancesByAccount: {},
    });

    expect(result.data.some((row) => row.accountId === "unassigned")).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("unassigned"))).toBe(true);
  });

  it("returns same result regardless of input order", () => {
    const inputA = [
      tx({ txnId: "x1", accountId: "acc-main", date: "2026-02-01", amountKrw: 10 }),
      tx({ txnId: "x2", accountId: "acc-main", date: "2026-01-01", amountKrw: -5 }),
      tx({ txnId: "x3", accountId: "acc-main", date: "2026-03-01", amountKrw: 7 }),
    ];
    const inputB = [inputA[2]!, inputA[0]!, inputA[1]!];

    const a = computeMonthlyBalances({
      transactions: inputA,
      openingBalancesByAccount: { "acc-main": opening("acc-main", 100) },
    });
    const b = computeMonthlyBalances({
      transactions: inputB,
      openingBalancesByAccount: { "acc-main": opening("acc-main", 100) },
    });

    expect(b).toEqual(a);
  });
});
