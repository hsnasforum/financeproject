import { describe, expect, it } from "vitest";
import { computeMonthlyBalances } from "../src/lib/planning/v3/service/balances";
import { type Account, type AccountTransaction } from "../src/lib/planning/v3/domain/types";

function account(id: string, startingBalanceKrw?: number): Account {
  return {
    id,
    name: id,
    kind: "checking",
    currency: "KRW",
    ...(Number.isInteger(startingBalanceKrw) ? { startingBalanceKrw } : {}),
  };
}

function tx(input: {
  accountId: string;
  date: string;
  amountKrw: number;
  description?: string;
  txnId: string;
}): AccountTransaction {
  return {
    accountId: input.accountId,
    date: input.date,
    amountKrw: input.amountKrw,
    ...(input.description ? { description: input.description } : {}),
    txnId: input.txnId,
    source: "csv",
  };
}

describe("planning v3 computeMonthlyBalances", () => {
  it("computes deterministic cumulative end balance when starting balance exists", () => {
    const rows = computeMonthlyBalances({
      accounts: [account("acc-main", 1000)],
      transactions: [
        tx({ accountId: "acc-main", date: "2026-01-10", amountKrw: 100, txnId: "t1" }),
        tx({ accountId: "acc-main", date: "2026-01-20", amountKrw: -40, txnId: "t2" }),
        tx({ accountId: "acc-main", date: "2026-02-01", amountKrw: -10, txnId: "t3" }),
      ],
    });

    expect(rows).toEqual([
      {
        ym: "2026-01",
        accountId: "acc-main",
        startingBalanceKrw: 1000,
        netKrw: 60,
        endBalanceKrw: 1060,
        hasStartingBalance: true,
      },
      {
        ym: "2026-02",
        accountId: "acc-main",
        startingBalanceKrw: 1000,
        netKrw: -10,
        endBalanceKrw: 1050,
        hasStartingBalance: true,
      },
    ]);
  });

  it("keeps endBalance undefined when starting balance is missing", () => {
    const rows = computeMonthlyBalances({
      accounts: [account("acc-no-start")],
      transactions: [
        tx({ accountId: "acc-no-start", date: "2026-03-01", amountKrw: 500, txnId: "m1" }),
      ],
    });

    expect(rows).toEqual([
      {
        ym: "2026-03",
        accountId: "acc-no-start",
        netKrw: 500,
        hasStartingBalance: false,
      },
    ]);
  });

  it("changes net/endBalance when includeTransfers option is toggled", () => {
    const accounts = [account("acc-a", 1000), account("acc-b", 500)];
    const transactions = [
      tx({ accountId: "acc-a", date: "2026-03-01", amountKrw: -200, description: "이체", txnId: "x1" }),
      tx({ accountId: "acc-b", date: "2026-03-01", amountKrw: 200, description: "이체", txnId: "x2" }),
      tx({ accountId: "acc-a", date: "2026-03-03", amountKrw: -50, description: "식비", txnId: "x3" }),
    ];

    const excluded = computeMonthlyBalances({ accounts, transactions, includeTransfers: false });
    const included = computeMonthlyBalances({ accounts, transactions, includeTransfers: true });

    expect(excluded).toEqual([
      {
        ym: "2026-03",
        accountId: "acc-a",
        startingBalanceKrw: 1000,
        netKrw: -50,
        endBalanceKrw: 950,
        hasStartingBalance: true,
      },
    ]);
    expect(included).toEqual([
      {
        ym: "2026-03",
        accountId: "acc-a",
        startingBalanceKrw: 1000,
        netKrw: -250,
        endBalanceKrw: 750,
        hasStartingBalance: true,
      },
      {
        ym: "2026-03",
        accountId: "acc-b",
        startingBalanceKrw: 500,
        netKrw: 200,
        endBalanceKrw: 700,
        hasStartingBalance: true,
      },
    ]);
  });

  it("supports negative starting balances", () => {
    const rows = computeMonthlyBalances({
      accounts: [account("acc-debt", -1000)],
      transactions: [
        tx({ accountId: "acc-debt", date: "2026-03-10", amountKrw: 200, txnId: "d1" }),
      ],
    });

    expect(rows).toEqual([
      {
        ym: "2026-03",
        accountId: "acc-debt",
        startingBalanceKrw: -1000,
        netKrw: 200,
        endBalanceKrw: -800,
        hasStartingBalance: true,
      },
    ]);
  });

  it("accumulates correctly across year boundaries in ym ascending order", () => {
    const rows = computeMonthlyBalances({
      accounts: [account("acc-main", 0)],
      transactions: [
        tx({ accountId: "acc-main", date: "2027-01-05", amountKrw: 50, txnId: "y2" }),
        tx({ accountId: "acc-main", date: "2026-12-31", amountKrw: 100, txnId: "y1" }),
      ],
    });

    expect(rows).toEqual([
      {
        ym: "2026-12",
        accountId: "acc-main",
        startingBalanceKrw: 0,
        netKrw: 100,
        endBalanceKrw: 100,
        hasStartingBalance: true,
      },
      {
        ym: "2027-01",
        accountId: "acc-main",
        startingBalanceKrw: 0,
        netKrw: 50,
        endBalanceKrw: 150,
        hasStartingBalance: true,
      },
    ]);
  });

  it("returns identical output regardless of input transaction order", () => {
    const accounts = [account("acc-main", 500)];
    const base = [
      tx({ accountId: "acc-main", date: "2026-04-01", amountKrw: 100, txnId: "z1" }),
      tx({ accountId: "acc-main", date: "2026-04-02", amountKrw: -30, txnId: "z2" }),
      tx({ accountId: "acc-main", date: "2026-05-01", amountKrw: -20, txnId: "z3" }),
    ];

    const rowsA = computeMonthlyBalances({
      accounts,
      transactions: base,
    });
    const rowsB = computeMonthlyBalances({
      accounts,
      transactions: [base[2]!, base[0]!, base[1]!],
    });

    expect(rowsB).toEqual(rowsA);
  });
});
