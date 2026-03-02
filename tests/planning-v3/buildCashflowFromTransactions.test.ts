import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CsvAccountSourceProvider } from "../../src/lib/planning/v3/providers/csvAccountSourceProvider";
import {
  buildCashflowFromTransactions,
  buildProfileDraftFromCashflow,
} from "../../src/lib/planning/v3/service/buildCashflowFromTransactions";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("buildCashflowFromTransactions (compat wrapper)", () => {
  it("aggregates month cashflow sorted asc", async () => {
    const provider = new CsvAccountSourceProvider();
    const transactions = await provider.loadTransactions({
      csvText: loadFixture("sample.csv"),
      mapping: {
        dateColumn: "date",
        amountColumn: "amount",
        descColumn: "description",
      },
      hasHeader: true,
    });

    const cashflow = buildCashflowFromTransactions(transactions);
    expect(cashflow).toEqual([
      { ym: "2026-01", income: 3_000_000, expense: 1_200_000, net: 1_800_000, txCount: 3 },
      { ym: "2026-02", income: 3_100_000, expense: 1_350_000, net: 1_750_000, txCount: 3 },
    ]);
  });

  it("uses median heuristic and returns stable draft", () => {
    const draft = buildProfileDraftFromCashflow([
      { ym: "2026-01", income: 3_000_000, expense: 1_200_000, net: 1_800_000, txCount: 3 },
      { ym: "2026-02", income: 3_100_000, expense: 1_350_000, net: 1_750_000, txCount: 3 },
    ]);

    expect(draft.monthlyIncomeNet).toBe(3_050_000);
    expect(draft.monthlyEssentialExpenses).toBe(892_500);
    expect(draft.monthlyDiscretionaryExpenses).toBe(382_500);
    expect(draft.monthsConsidered).toBe(2);
  });

  it("returns zeroed draft for empty input", () => {
    const draft = buildProfileDraftFromCashflow([]);
    expect(draft).toEqual({
      monthlyIncomeNet: 0,
      monthlyEssentialExpenses: 0,
      monthlyDiscretionaryExpenses: 0,
      assumptions: [
        "월 수입/지출은 월별 중앙값(median) 기준 추정치입니다.",
        "월 지출은 필수 70% / 재량 30% 고정 분할 가정을 사용합니다.",
        "초안은 저장/실행 전 검토용입니다.",
      ],
      monthsConsidered: 0,
    });
  });
});
