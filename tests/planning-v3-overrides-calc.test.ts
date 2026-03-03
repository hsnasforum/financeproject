import { describe, expect, it } from "vitest";
import { aggregateMonthlyCashflow } from "../src/lib/planning/v3/service/aggregateMonthlyCashflow";
import { computeMonthlyBalances } from "../src/lib/planning/v3/service/balances";
import { type Account, type AccountTransaction, type TxnOverride } from "../src/lib/planning/v3/domain/types";

describe("planning v3 overrides integration with calculations", () => {
  it("changes cashflow totals/net when override changes kind", () => {
    const transactions: AccountTransaction[] = [
      {
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        date: "2026-03-01",
        amountKrw: 100,
        description: "masked in",
        source: "csv",
      },
      {
        txnId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        date: "2026-03-02",
        amountKrw: -30,
        description: "masked out",
        source: "csv",
      },
    ];

    const baseline = aggregateMonthlyCashflow(transactions, { includeTransfers: false });
    expect(baseline[0]?.netKrw).toBe(70);
    expect(baseline[0]?.totals?.incomeKrw).toBe(100);

    const overrides: Record<string, TxnOverride> = {
      aaaaaaaaaaaaaaaaaaaaaaaa: {
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        kind: "transfer",
        updatedAt: "2026-03-03T00:00:00.000Z",
      },
    };
    const overridden = aggregateMonthlyCashflow(transactions, {
      includeTransfers: false,
      overridesByTxnId: overrides,
    });

    expect(overridden[0]?.netKrw).toBe(-30);
    expect(overridden[0]?.totals?.incomeKrw).toBe(0);
    expect(overridden[0]?.totals?.transferInKrw).toBe(100);
  });

  it("changes balances with includeTransfers option when override marks transfer", () => {
    const accounts: Account[] = [
      {
        id: "acc-main",
        name: "Main",
        kind: "checking",
        currency: "KRW",
        startingBalanceKrw: 1000,
      },
    ];
    const transactions: AccountTransaction[] = [
      {
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        accountId: "acc-main",
        date: "2026-03-01",
        amountKrw: 200,
        source: "csv",
      },
      {
        txnId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        accountId: "acc-main",
        date: "2026-03-02",
        amountKrw: -50,
        source: "csv",
      },
    ];
    const overrides: Record<string, TxnOverride> = {
      aaaaaaaaaaaaaaaaaaaaaaaa: {
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        kind: "transfer",
        updatedAt: "2026-03-03T00:00:00.000Z",
      },
    };

    const excluded = computeMonthlyBalances({
      accounts,
      transactions,
      includeTransfers: false,
      overridesByTxnId: overrides,
    });
    const included = computeMonthlyBalances({
      accounts,
      transactions,
      includeTransfers: true,
      overridesByTxnId: overrides,
    });

    expect(excluded[0]?.netKrw).toBe(-50);
    expect(excluded[0]?.endBalanceKrw).toBe(950);
    expect(included[0]?.netKrw).toBe(150);
    expect(included[0]?.endBalanceKrw).toBe(1150);
  });
});
