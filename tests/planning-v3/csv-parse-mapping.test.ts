import { describe, expect, it } from "vitest";
import { parseCsvTransactions } from "../../src/lib/planning/v3/providers/csv/csvProvider";

describe("parseCsvTransactions with mapping", () => {
  it("parses weird header names correctly when mapping is provided", () => {
    const canonicalCsv = [
      "date,amount,desc",
      "2026-03-01,1000000,salary",
      "2026-03-03,-300000,rent",
    ].join("\n");
    const mappedCsv = [
      "when,value,memo",
      "2026-03-01,1000000,salary",
      "2026-03-03,-300000,rent",
    ].join("\n");

    const canonical = parseCsvTransactions(canonicalCsv);
    const mapped = parseCsvTransactions(mappedCsv, {
      mapping: {
        dateKey: "when",
        amountKey: "value",
        descKey: "memo",
        amountSign: "signed",
      },
    });

    expect(mapped.stats).toEqual(canonical.stats);
    expect(mapped.errors).toEqual(canonical.errors);
    expect(mapped.transactions).toEqual(canonical.transactions);
  });
});

