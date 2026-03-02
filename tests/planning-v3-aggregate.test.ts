import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvTransactions } from "../src/lib/planning/v3/providers/csv/csvProvider";
import { aggregateMonthlyCashflow } from "../src/lib/planning/v3/service/aggregate";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("aggregateMonthlyCashflow", () => {
  it("aggregates monthly inflow/outflow with stable sorting", () => {
    const parsed = parseCsvTransactions(loadFixture("sample.csv"), {
      hasHeader: true,
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
        typeColumn: "type",
      },
    });

    const reversed = [...parsed.transactions].reverse();
    const cashflows = aggregateMonthlyCashflow(reversed);

    expect(cashflows).toEqual([
      {
        month: "2026-01",
        inflowKrw: 3_000_000,
        outflowKrw: 1_200_000,
        netKrw: 1_800_000,
      },
      {
        month: "2026-02",
        inflowKrw: 3_100_000,
        outflowKrw: 1_350_000,
        netKrw: 1_750_000,
      },
    ]);
  });
});
