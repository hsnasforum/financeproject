import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CsvAccountSourceProvider } from "../../src/lib/planning/v3/providers/csvAccountSourceProvider";
import { buildCashflowFromTransactions, buildProfileDraftFromCashflow } from "../../src/lib/planning/v3/service/buildCashflowFromTransactions";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("buildCashflowFromTransactions", () => {
  it("aggregates month cashflow sorted asc", async () => {
    const provider = new CsvAccountSourceProvider();
    const transactions = await provider.loadTransactions({
      csvText: loadFixture("sample.csv"),
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
        typeColumn: "type",
      },
      hasHeader: true,
    });

    const cashflow = buildCashflowFromTransactions(transactions);
    expect(cashflow).toEqual([
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

describe("buildProfileDraftFromCashflow", () => {
  it("uses median heuristic and returns stable draft", () => {
    const draft = buildProfileDraftFromCashflow([
      { month: "2026-01", inflowKrw: 3_000_000, outflowKrw: 1_200_000, netKrw: 1_800_000 },
      { month: "2026-02", inflowKrw: 3_100_000, outflowKrw: 1_350_000, netKrw: 1_750_000 },
    ]);

    expect(draft.monthlyIncomeNet).toBe(3_050_000);
    expect(draft.monthlyEssentialExpenses).toBe(892_500);
    expect(draft.monthlyDiscretionaryExpenses).toBe(382_500);
    expect(draft.notes?.length).toBeGreaterThan(0);
  });

  it("returns note-only draft for empty input", () => {
    const draft = buildProfileDraftFromCashflow([]);
    expect(draft.monthlyIncomeNet).toBeUndefined();
    expect(draft.notes?.[0]).toContain("초안");
  });
});
