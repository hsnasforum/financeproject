import { describe, expect, it } from "vitest";
import { type AccountTransaction } from "../src/lib/planning/v3/domain/types";
import { aggregateMonthlyCashflow } from "../src/lib/planning/v3/service/aggregateMonthlyCashflow";

const transactions: AccountTransaction[] = [
  { date: "2026-01-02", amountKrw: 3_000_000, description: "salary", source: "csv", meta: { rowIndex: 1 } },
  { date: "2026-01-05", amountKrw: -900_000, description: "월세", source: "csv", meta: { rowIndex: 2 } },
  { date: "2026-01-10", amountKrw: -100_000, description: "식비", source: "csv", meta: { rowIndex: 3 } },
  { date: "2026-01-18", amountKrw: -50_000, description: "misc", source: "csv", meta: { rowIndex: 4 } },
  { date: "2026-02-01", amountKrw: 3_200_000, description: "salary", source: "csv", meta: { rowIndex: 5 } },
  { date: "2026-02-03", amountKrw: -850_000, description: "rent", source: "csv", meta: { rowIndex: 6 } },
  { date: "2026-02-20", amountKrw: -200_000, description: "grocery", source: "csv", meta: { rowIndex: 7 } },
];

describe("planning v3 aggregateMonthlyCashflow v2", () => {
  it("aggregates inflow/outflow/fixed/variable deterministically", () => {
    const first = aggregateMonthlyCashflow(transactions);
    const second = aggregateMonthlyCashflow(transactions);

    expect(first).toEqual(second);
    expect(first).toEqual([
      {
        month: "2026-01",
        inflowKrw: 3_000_000,
        outflowKrw: 1_050_000,
        fixedOutflowKrw: 900_000,
        variableOutflowKrw: 150_000,
        transferNetKrw: 0,
        netKrw: 1_950_000,
        ym: "2026-01",
        incomeKrw: 3_000_000,
        expenseKrw: -1_050_000,
        totals: {
          incomeKrw: 3_000_000,
          expenseKrw: -1_050_000,
          transferInKrw: 0,
          transferOutKrw: 0,
          netKrw: 1_950_000,
        },
        txCount: 4,
        daysCovered: 17,
        notes: ["unknown treated as variable"],
      },
      {
        month: "2026-02",
        inflowKrw: 3_200_000,
        outflowKrw: 1_050_000,
        fixedOutflowKrw: 850_000,
        variableOutflowKrw: 200_000,
        transferNetKrw: 0,
        netKrw: 2_150_000,
        ym: "2026-02",
        incomeKrw: 3_200_000,
        expenseKrw: -1_050_000,
        totals: {
          incomeKrw: 3_200_000,
          expenseKrw: -1_050_000,
          transferInKrw: 0,
          transferOutKrw: 0,
          netKrw: 2_150_000,
        },
        txCount: 3,
        daysCovered: 20,
      },
    ]);
  });
});
