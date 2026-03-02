import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importCsvToDraft } from "../src/lib/planning/v3/service/importCsvDraft";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", name), "utf-8");
}

describe("importCsvToDraft", () => {
  it("builds parsed result, monthly cashflow, and stable draft in one pure pipeline", () => {
    const result = importCsvToDraft(loadFixture("sample.csv"));

    expect(result.parsed.errors).toEqual([]);
    expect(result.parsed.stats).toEqual({ rows: 6, parsed: 6, skipped: 0 });
    expect(result.cashflows).toEqual([
      { ym: "2026-01", income: 3_000_000, expense: 1_200_000, net: 1_800_000, txCount: 3 },
      { ym: "2026-02", income: 3_100_000, expense: 1_350_000, net: 1_750_000, txCount: 3 },
    ]);
    expect(result.draft).toEqual({
      monthlyIncomeNet: 3_050_000,
      monthlyEssentialExpenses: 892_500,
      monthlyDiscretionaryExpenses: 382_500,
      assumptions: [
        "월 수입/지출은 월별 중앙값(median) 기준 추정치입니다.",
        "월 지출은 필수 70% / 재량 30% 고정 분할 가정을 사용합니다.",
        "초안은 저장/실행 전 검토용입니다.",
      ],
      monthsConsidered: 2,
    });
  });
});
