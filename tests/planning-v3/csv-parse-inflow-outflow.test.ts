import { describe, expect, it } from "vitest";
import { parseCsvTransactions } from "../../src/lib/planning/v3/providers/csv/csvProvider";

describe("parseCsvTransactions inflow/outflow mode", () => {
  it("computes signed amount from inflow and outflow columns", () => {
    const csv = [
      "when,credit,debit,memo",
      "2026-03-01,1000000,,salary",
      "2026-03-02,,300000,rent",
      "2026-03-03,500000,100000,adjustment",
      "2026-03-04,\"1,200,000\",\"200,000\",bonus",
    ].join("\n");

    const result = parseCsvTransactions(csv, {
      mapping: {
        dateKey: "when",
        inflowKey: "credit",
        outflowKey: "debit",
        descKey: "memo",
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.stats).toEqual({ rows: 4, parsed: 4, skipped: 0 });
    expect(result.transactions.map((tx) => tx.amountKrw)).toEqual([
      1_000_000,
      -300_000,
      400_000,
      1_000_000,
    ]);
  });
});
