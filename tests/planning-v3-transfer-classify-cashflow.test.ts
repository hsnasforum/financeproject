import { describe, expect, it } from "vitest";
import { type Account, type AccountTransaction } from "../src/lib/planning/v3/domain/types";
import { aggregateMonthlyCashflow } from "../src/lib/planning/v3/service/aggregateMonthlyCashflow";
import { classifyTransactions } from "../src/lib/planning/v3/service/classify";
import { detectTransfers } from "../src/lib/planning/v3/service/transferDetect";

const accounts: Account[] = [
  { id: "acc-a", name: "A", kind: "checking", currency: "KRW" },
  { id: "acc-b", name: "B", kind: "checking", currency: "KRW" },
  { id: "acc-c", name: "C", kind: "checking", currency: "KRW" },
  { id: "acc-d", name: "D", kind: "checking", currency: "KRW" },
];

describe("planning v3 transfer/classify/cashflow", () => {
  it("pairs one transfer by same date + abs amount + opposite sign", () => {
    const input: AccountTransaction[] = [
      { txnId: "n-1", date: "2026-03-01", amountKrw: -50_000, accountId: "acc-a", source: "csv" },
      { txnId: "p-1", date: "2026-03-01", amountKrw: 50_000, accountId: "acc-b", source: "csv" },
    ];

    const result = detectTransfers({ transactions: input, accounts });
    expect(result.transactions.map((row) => row.kind)).toEqual(["transfer", "transfer"]);
  });

  it("pairs multi-candidates deterministically by txnId lexical order", () => {
    const input: AccountTransaction[] = [
      { txnId: "n-a", date: "2026-03-02", amountKrw: -100_000, accountId: "acc-a", source: "csv" },
      { txnId: "n-d", date: "2026-03-02", amountKrw: -100_000, accountId: "acc-d", source: "csv" },
      { txnId: "p-b", date: "2026-03-02", amountKrw: 100_000, accountId: "acc-b", source: "csv" },
      { txnId: "p-c", date: "2026-03-02", amountKrw: 100_000, accountId: "acc-c", source: "csv" },
    ];

    const first = detectTransfers({ transactions: input, accounts });
    const second = detectTransfers({ transactions: [...input].reverse(), accounts });

    const firstPairs = first.transactions
      .filter((row) => row.kind === "transfer" && row.transfer?.direction === "out")
      .map((row) => `${row.txnId}->${row.transfer?.matchedTxnId}`)
      .sort();
    const secondPairs = second.transactions
      .filter((row) => row.kind === "transfer" && row.transfer?.direction === "out")
      .map((row) => `${row.txnId}->${row.transfer?.matchedTxnId}`)
      .sort();

    expect(firstPairs).toEqual(["n-a->p-b", "n-d->p-c"]);
    expect(firstPairs).toEqual(secondPairs);
  });

  it("marks both sides as transfer and links matchedTxnId mutually", () => {
    const input: AccountTransaction[] = [
      { txnId: "n-2", date: "2026-03-03", amountKrw: -30_000, accountId: "acc-a", source: "csv" },
      { txnId: "p-2", date: "2026-03-03", amountKrw: 30_000, accountId: "acc-c", source: "csv" },
    ];
    const result = detectTransfers({ transactions: input, accounts }).transactions;

    const out = result.find((row) => row.txnId === "n-2");
    const inTx = result.find((row) => row.txnId === "p-2");
    expect(out?.kind).toBe("transfer");
    expect(inTx?.kind).toBe("transfer");
    expect(out?.transfer?.matchedTxnId).toBe("p-2");
    expect(inTx?.transfer?.matchedTxnId).toBe("n-2");
  });

  it("keeps unmatched rows as income/expense", () => {
    const input: AccountTransaction[] = [
      { txnId: "x-1", date: "2026-03-04", amountKrw: -20_000, accountId: "acc-a", source: "csv" },
      { txnId: "x-2", date: "2026-03-04", amountKrw: 20_000, accountId: "acc-a", source: "csv" },
    ];
    const result = classifyTransactions({ transactions: input, accounts });
    expect(result.map((row) => row.kind)).toEqual(["expense", "income"]);
  });

  it("excludeTransfers=true keeps net without transfer amounts", () => {
    const input: AccountTransaction[] = [
      { txnId: "i-1", date: "2026-03-05", amountKrw: 1_000_000, accountId: "acc-a", source: "csv" },
      { txnId: "e-1", date: "2026-03-06", amountKrw: -300_000, accountId: "acc-a", source: "csv" },
      { txnId: "t-in-1", date: "2026-03-07", amountKrw: 200_000, accountId: "acc-a", kind: "transfer", source: "csv" },
    ];
    const monthly = aggregateMonthlyCashflow(input, { includeTransfers: false });
    expect(monthly[0]?.netKrw).toBe(700_000);
  });

  it("includeTransfers=true includes transfer amounts into net", () => {
    const input: AccountTransaction[] = [
      { txnId: "i-2", date: "2026-03-05", amountKrw: 1_000_000, accountId: "acc-a", source: "csv" },
      { txnId: "e-2", date: "2026-03-06", amountKrw: -300_000, accountId: "acc-a", source: "csv" },
      { txnId: "t-in-2", date: "2026-03-07", amountKrw: 200_000, accountId: "acc-a", kind: "transfer", source: "csv" },
    ];
    const monthly = aggregateMonthlyCashflow(input, { includeTransfers: true });
    expect(monthly[0]?.netKrw).toBe(900_000);
  });

  it("applies policy rules deterministically with fixed priority", () => {
    const input: AccountTransaction[] = [
      { txnId: "r-1", date: "2026-03-08", amountKrw: -100_000, accountId: "acc-a", description: "월세 카페", source: "csv" },
      { txnId: "r-2", date: "2026-03-08", amountKrw: 100_000, accountId: "acc-a", description: "적금 배당", source: "csv" },
    ];

    const first = classifyTransactions({ transactions: input, accounts });
    const second = classifyTransactions({ transactions: input, accounts });

    expect(first.map((row) => row.category)).toEqual(["fixed", "saving"]);
    expect(first.map((row) => row.matchedRuleId)).toEqual([
      "expense-fixed-housing-bills",
      "income-saving",
    ]);
    expect(first).toEqual(second);
  });
});
