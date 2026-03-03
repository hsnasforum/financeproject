import { describe, expect, it } from "vitest";
import { type AccountTransaction } from "../src/lib/planning/v3/domain/types";
import { dedupeTransactions } from "../src/lib/planning/v3/service/dedupe";
import { buildTxnId, isTxnId, normalizeDescriptionForTxnId } from "../src/lib/planning/v3/service/txnId";

describe("planning v3 txnId + dedupe", () => {
  it("buildTxnId returns deterministic fixed-length hex id", () => {
    const first = buildTxnId({
      dateIso: "2026-03-01",
      amountKrw: -1234,
      descNorm: normalizeDescriptionForTxnId("Coffee Shop"),
      currency: "krw",
    });
    const second = buildTxnId({
      dateIso: "2026-03-01",
      amountKrw: -1234,
      descNorm: normalizeDescriptionForTxnId("Coffee Shop"),
      currency: "KRW",
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(24);
    expect(isTxnId(first)).toBe(true);
  });

  it("description normalization converges spacing/case/punctuation variants", () => {
    const variants = [
      "  STARBUCKS  Seoul #12 ",
      "starbucks seoul 12",
      "Starbucks, Seoul-12!!!",
    ];

    const ids = variants.map((desc) => buildTxnId({
      dateIso: "2026-03-02",
      amountKrw: -4500,
      descNorm: normalizeDescriptionForTxnId(desc),
      currency: "KRW",
    }));

    expect(new Set(ids).size).toBe(1);
  });

  it("dedupeTransactions keeps first-seen transaction and sorts deterministically", () => {
    const base: AccountTransaction[] = [
      {
        date: "2026-03-03",
        amountKrw: -3000,
        description: "Lunch",
        source: "csv",
        meta: { rowIndex: 2 },
      },
      {
        date: "2026-03-01",
        amountKrw: 3_000_000,
        description: "Salary",
        source: "csv",
        meta: { rowIndex: 1 },
      },
      {
        date: "2026-03-03",
        amountKrw: -3000,
        description: " lunch ",
        source: "csv",
        meta: { rowIndex: 9 },
      },
    ];

    const shuffled: AccountTransaction[] = [base[2]!, base[1]!, base[0]!];

    const first = dedupeTransactions(base);
    const second = dedupeTransactions(shuffled);

    expect(first.dedupedCount).toBe(1);
    expect(second.dedupedCount).toBe(1);

    expect(first.transactions.map((row) => ({ date: row.date, amountKrw: row.amountKrw, txnId: row.txnId }))).toEqual(
      second.transactions.map((row) => ({ date: row.date, amountKrw: row.amountKrw, txnId: row.txnId })),
    );
    expect(first.transactions.map((row) => row.date)).toEqual(["2026-03-01", "2026-03-03"]);
  });
});
