import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvTransactions } from "../../src/lib/planning/v3/providers/csv/csvProvider";
import { aggregateMonthlyCashflow } from "../../src/lib/planning/v3/service/aggregate";
import { buildProfileV2DraftPatch } from "../../src/lib/planning/v3/service/draftPatch";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("planning v3 profile patch draft", () => {
  it("builds deterministic patch with category-based split", () => {
    const parsed = parseCsvTransactions(loadFixture("sample.csv"));
    const monthly = aggregateMonthlyCashflow(parsed.transactions);

    const first = buildProfileV2DraftPatch(monthly);
    const second = buildProfileV2DraftPatch(monthly);

    expect(first).toEqual(second);
    expect(first).toEqual({
      monthlyIncomeNet: 3_101_234,
      monthlyEssentialExpenses: 850_000,
      monthlyDiscretionaryExpenses: 350_000,
      assumptions: [
        "monthlyIncomeNet uses median recent inflow (assumption)",
        "split mode byCategory (rule-based categorization)",
      ],
      monthsConsidered: 3,
    });
  });
});
