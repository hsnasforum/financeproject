import { describe, expect, it } from "vitest";
import { type AccountTransaction, type TxnTransferOverride } from "../src/lib/planning/v3/domain/types";
import { detectTransfers } from "../src/lib/planning/v3/service/detectTransfers";

function tx(patch: Partial<AccountTransaction>): AccountTransaction {
  return {
    txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    date: "2026-03-01",
    amountKrw: -1000,
    source: "csv",
    ...patch,
  };
}

describe("planning v3 detectTransfers", () => {
  it("matches one pair with same date and equal abs amount", () => {
    const result = detectTransfers({
      batchId: "batch-a",
      transactions: [
        tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", accountId: "acc-a", amountKrw: -50000 }),
        tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", accountId: "acc-b", amountKrw: 50000 }),
      ],
    });
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]?.debitTxnId).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(result.detections[0]?.creditTxnId).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(result.transactions.map((row) => row.kind)).toEqual(["transfer", "transfer"]);
  });

  it("tie-breaks deterministically when multiple credits are candidates", () => {
    const input: AccountTransaction[] = [
      tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: -100000, accountId: "acc-a" }),
      tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-03-01", amountKrw: 100000, accountId: "acc-b" }),
      tx({ txnId: "cccccccccccccccccccccccc", date: "2026-03-01", amountKrw: 100000, accountId: "acc-c" }),
    ];
    const first = detectTransfers({ batchId: "batch-a", transactions: input });
    const second = detectTransfers({ batchId: "batch-a", transactions: [...input].reverse() });
    expect(first.detections).toHaveLength(1);
    expect(first.detections[0]?.creditTxnId).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(second.detections[0]?.creditTxnId).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("matches adjacent-day only when allowAdjacentDate=true", () => {
    const input: AccountTransaction[] = [
      tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-03-01", amountKrw: -70000, accountId: "acc-a" }),
      tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-03-02", amountKrw: 70000, accountId: "acc-b" }),
    ];
    const disabled = detectTransfers({
      batchId: "batch-a",
      transactions: input,
      allowAdjacentDate: false,
    });
    const enabled = detectTransfers({
      batchId: "batch-a",
      transactions: input,
      allowAdjacentDate: true,
    });
    expect(disabled.detections).toHaveLength(0);
    expect(enabled.detections).toHaveLength(1);
  });

  it("does not match when accountId is the same", () => {
    const result = detectTransfers({
      batchId: "batch-a",
      transactions: [
        tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", accountId: "acc-a", amountKrw: -30000 }),
        tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", accountId: "acc-a", amountKrw: 30000 }),
      ],
    });
    expect(result.detections).toHaveLength(0);
  });

  it("forceNonTransfer blocks natural matching", () => {
    const overrides: Record<string, TxnTransferOverride> = {
      aaaaaaaaaaaaaaaaaaaaaaaa: {
        batchId: "batch-a",
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        forceNonTransfer: true,
        updatedAt: "2026-03-03T00:00:00.000Z",
      },
    };
    const result = detectTransfers({
      batchId: "batch-a",
      transactions: [
        tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", accountId: "acc-a", amountKrw: -40000 }),
        tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", accountId: "acc-b", amountKrw: 40000 }),
      ],
      overridesByTxnId: overrides,
    });
    expect(result.detections).toHaveLength(0);
  });

  it("forceTransfer can include non-natural pair with low confidence", () => {
    const overrides: Record<string, TxnTransferOverride> = {
      aaaaaaaaaaaaaaaaaaaaaaaa: {
        batchId: "batch-a",
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        forceTransfer: true,
        updatedAt: "2026-03-03T00:00:00.000Z",
      },
    };
    const result = detectTransfers({
      batchId: "batch-a",
      transactions: [
        tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-03-01", accountId: "acc-a", amountKrw: -41000 }),
        tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-03-10", accountId: "acc-b", amountKrw: 9000 }),
      ],
      overridesByTxnId: overrides,
      allowAdjacentDate: false,
    });
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]?.confidence).toBe("low");
    expect(result.detections[0]?.reason).toBe("override");
  });

  it("returns detections in deterministic sort order", () => {
    const result = detectTransfers({
      batchId: "batch-z",
      transactions: [
        tx({ txnId: "cccccccccccccccccccccccc", date: "2026-04-02", accountId: "acc-a", amountKrw: -100 }),
        tx({ txnId: "dddddddddddddddddddddddd", date: "2026-04-02", accountId: "acc-b", amountKrw: 100 }),
        tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-04-01", accountId: "acc-c", amountKrw: -200 }),
        tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-04-01", accountId: "acc-d", amountKrw: 200 }),
      ],
    });
    expect(result.detections.map((row) => `${row.ym}:${row.debitTxnId}->${row.creditTxnId}`)).toEqual([
      "2026-04:aaaaaaaaaaaaaaaaaaaaaaaa->bbbbbbbbbbbbbbbbbbbbbbbb",
      "2026-04:cccccccccccccccccccccccc->dddddddddddddddddddddddd",
    ]);
  });
});
