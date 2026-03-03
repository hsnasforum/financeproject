import { describe, expect, it } from "vitest";
import { type AccountTransaction, type MonthlyCashflow } from "../src/lib/planning/v3/domain/types";
import { buildDraftPatchFromCashflow } from "../src/lib/planning/v3/service/buildDraftPatchFromCashflow";
import { categorizeTransactions } from "../src/lib/planning/v3/service/categorize";

const cashflowFixture: MonthlyCashflow[] = [
  {
    month: "2026-01",
    inflowKrw: 3_000_000,
    outflowKrw: 1_000_000,
    fixedOutflowKrw: 700_000,
    variableOutflowKrw: 300_000,
    transferNetKrw: 0,
    ym: "2026-01",
    incomeKrw: 3_000_000,
    expenseKrw: -1_000_000,
    netKrw: 2_000_000,
    txCount: 4,
    daysCovered: 31,
  },
  {
    month: "2026-02",
    inflowKrw: 3_200_000,
    outflowKrw: 1_200_000,
    fixedOutflowKrw: 800_000,
    variableOutflowKrw: 400_000,
    transferNetKrw: 0,
    ym: "2026-02",
    incomeKrw: 3_200_000,
    expenseKrw: -1_200_000,
    netKrw: 2_000_000,
    txCount: 4,
    daysCovered: 28,
  },
  {
    month: "2026-03",
    inflowKrw: 3_100_000,
    outflowKrw: 900_000,
    fixedOutflowKrw: 600_000,
    variableOutflowKrw: 300_000,
    transferNetKrw: 0,
    ym: "2026-03",
    incomeKrw: 3_100_000,
    expenseKrw: -900_000,
    netKrw: 2_200_000,
    txCount: 4,
    daysCovered: 30,
  },
];

describe("planning v3 categorize + split + evidence", () => {
  it("categorizes by deterministic rules without leaking raw description", () => {
    const transactions: AccountTransaction[] = [
      { date: "2026-03-01", amountKrw: 3_000_000, description: "salary", source: "csv", meta: { rowIndex: 1 } },
      { date: "2026-03-02", amountKrw: -30_000, description: "이체 출금", source: "csv", meta: { rowIndex: 2 } },
      { date: "2026-03-03", amountKrw: -900_000, description: "월세 자동이체", source: "csv", meta: { rowIndex: 3 } },
      { date: "2026-03-04", amountKrw: -12_000, description: "PII_SHOULD_NOT_LEAK 카페 결제", source: "csv", meta: { rowIndex: 4 } },
      { date: "2026-03-05", amountKrw: -7_000, description: "기타", source: "csv", meta: { rowIndex: 5 } },
    ];

    const categorized = categorizeTransactions(transactions);
    expect(categorized.map((row) => row.category)).toEqual(["income", "unknown", "fixed", "variable", "unknown"]);
    expect(categorized[3]?.categoryReason).not.toContain("PII_SHOULD_NOT_LEAK");
  });

  it("builds split with byCategory mode", () => {
    const built = buildDraftPatchFromCashflow(cashflowFixture, { splitMode: "byCategory" });
    expect(built.profilePatch).toEqual({
      monthlyIncomeNet: 3_100_000,
      monthlyEssentialExpenses: 700_000,
      monthlyDiscretionaryExpenses: 300_000,
    });
    expect(built.draftPatch.splitMode).toBe("byCategory");
  });

  it("builds split with byRatio mode", () => {
    const built = buildDraftPatchFromCashflow(cashflowFixture, {
      splitMode: "byRatio",
      fixedRatio: 0.6,
      variableRatio: 0.4,
    });
    expect(built.profilePatch).toEqual({
      monthlyIncomeNet: 3_100_000,
      monthlyEssentialExpenses: 600_000,
      monthlyDiscretionaryExpenses: 400_000,
    });
    expect(built.draftPatch.fixedRatio).toBe(0.6);
    expect(built.draftPatch.variableRatio).toBe(0.4);
  });

  it("rejects invalid ratio sum for byRatio mode", () => {
    expect(() => buildDraftPatchFromCashflow(cashflowFixture, {
      splitMode: "byRatio",
      fixedRatio: 0.8,
      variableRatio: 0.4,
    })).toThrowError("Invalid split ratio");
  });

  it("supports noSplit mode and emits standardized evidence rows", () => {
    const built = buildDraftPatchFromCashflow(cashflowFixture, { splitMode: "noSplit" });
    expect(built.profilePatch).toEqual({
      monthlyIncomeNet: 3_100_000,
      monthlyEssentialExpenses: 0,
      monthlyDiscretionaryExpenses: 1_000_000,
    });
    expect(built.draftPatch.evidence).toHaveLength(3);
    for (const row of built.draftPatch.evidence) {
      expect(typeof row.key).toBe("string");
      expect(typeof row.title).toBe("string");
      expect(typeof row.inputs).toBe("object");
    }
  });
});
